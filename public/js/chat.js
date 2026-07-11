/**
 * Eventra Support Chat Client Logic
 */

window.EventraChat = (function() {
    let pollInterval = null;
    let currentConversationId = null;
    let authId = null;
    let isWidgetOpen = false;
    let lastMessageCount = 0;

    const UI = {
        widget: null,
        body: null,
        input: null,
        statusText: null,
        typingIndicator: null,
        badge: null,
        inboxView: null
    };

    async function init() {
        if (!document.getElementById('eventra-chat-widget')) {
            try {
                const htmlRes = await fetch('/public/components/chat-widget.html');
                const htmlText = await htmlRes.text();
                const container = document.createElement('div');
                container.innerHTML = htmlText;
                document.body.appendChild(container);
            } catch(e) {
                console.error("Failed to load chat widget HTML", e);
                return;
            }
        }

        UI.widget = document.getElementById('eventra-chat-widget');
        UI.body = document.getElementById('chat-body');
        UI.input = document.getElementById('chat-input-field');
        UI.statusText = document.getElementById('chat-status-text');
        UI.typingIndicator = document.getElementById('chat-typing-indicator');
        UI.badge = document.getElementById('chat-unread-badge');
        
        // Create inbox view container if it doesn't exist
        UI.inboxView = document.createElement('div');
        UI.inboxView.id = 'chat-inbox-view';
        UI.inboxView.style.display = 'none';
        UI.inboxView.style.padding = '10px';
        UI.inboxView.style.overflowY = 'auto';
        UI.inboxView.style.height = '100%';
        UI.body.parentNode.insertBefore(UI.inboxView, UI.body);

        // Add back button to header
        const backBtn = document.createElement('button');
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
        backBtn.style.cssText = 'background:none; border:none; color:white; margin-right:10px; display:none; cursor:pointer;';
        backBtn.id = 'chat-back-btn';
        backBtn.onclick = () => showInbox();
        document.querySelector('.chat-header').prepend(backBtn);

        try {
            // Get Auth Token if available, but proceed even if not
            const res = await fetch('/api/chat/auth-token.php');
            const data = await res.json();
            
            if (data.success && data.token) {
                try {
                    const payload = JSON.parse(atob(data.token.split('.')[1]));
                    authId = payload.auth_id;
                } catch(e) {}
            }
            
            UI.statusText.innerText = "Online";
            UI.statusText.style.color = "#a7f3d0";
            startStream();
            
        } catch (error) {
            console.error("Chat init error:", error);
            // Proceed anyway, stream.php handles guest auth creation
            UI.statusText.innerText = "Online";
            UI.statusText.style.color = "#a7f3d0";
            startStream();
        }
    }

    let eventSource = null;
    let lastEventId = 0;

    async function startStream() {
        if (eventSource) {
            eventSource.close();
        }

        let url = `/api/chat/stream.php?lastEventId=${lastEventId}`;
        if (currentConversationId) {
            url += `&conversation_id=${currentConversationId}`;
        }

        eventSource = new EventSource(url);

        eventSource.onmessage = function(e) {
            try {
                const msg = JSON.parse(e.data);
                if (currentConversationId && msg.conversation_id == currentConversationId) {
                    appendMessage(msg, true);
                    markRead(currentConversationId);
                } else if (!isWidgetOpen || !currentConversationId) {
                    // Update badge logic if not in active conversation
                    refreshInboxAndBadge();
                }
                lastEventId = Math.max(lastEventId, parseInt(msg.id) || 0);
            } catch(err) {
                console.error("SSE parse error", err);
            }
        };

        eventSource.onerror = function(e) {
            console.log("Stream error, attempting to reconnect...");
        };
    }

    async function refreshInboxAndBadge() {
        try {
            const res = await fetch('/api/chat/chat.php?action=conversations');
            const data = await res.json();
            if (data.success) {
                let totalUnread = 0;
                data.conversations.forEach(c => totalUnread += c.unread_count);
                if (totalUnread > 0) {
                    UI.badge.innerText = totalUnread;
                    UI.badge.style.display = 'flex';
                } else {
                    UI.badge.style.display = 'none';
                }
                
                // If viewing inbox, refresh the view
                if (UI.inboxView.style.display === 'block') {
                    renderInbox(data.conversations);
                }
            }
        } catch(e) {}
    }

    async function markRead(convId) {
        try {
            await fetch('/api/chat/chat.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_read', conversation_id: convId })
            });
            refreshInboxAndBadge(); // Update badge instantly
        } catch(e) {}
    }

    async function loadHistory(conversationId) {
        currentConversationId = conversationId;
        UI.body.innerHTML = '';
        UI.body.appendChild(UI.typingIndicator); // Keep indicator at bottom
        
        try {
            const res = await fetch(`/api/chat/chat.php?action=messages&conversation_id=${conversationId}`);
            const data = await res.json();
            
            if (data.success && data.messages) {
                data.messages.forEach(msg => appendMessage(msg, false));
                scrollToBottom();
                lastMessageCount = data.messages.length;
                if (isWidgetOpen) {
                    markRead(currentConversationId);
                }
            }
        } catch (err) {
            console.error("Failed to load history", err);
        }
    }

    async function showInbox() {
        UI.body.style.display = 'none';
        document.querySelector('.chat-footer').style.display = 'none';
        UI.inboxView.style.display = 'block';
        document.getElementById('chat-back-btn').style.display = 'none';
        UI.statusText.innerText = "Inbox";
        
        try {
            const res = await fetch('/api/chat/chat.php?action=conversations');
            const data = await res.json();
            
            if (data.success) {
                UI.inboxView.innerHTML = '';
                if (data.conversations.length === 0) {
                    UI.inboxView.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280;">No conversations yet.</div>';
                    return;
                }

                data.conversations.forEach(conv => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 12px; border-bottom: 1px solid #e5e7eb; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; margin-bottom: 4px;';
                    div.onmouseover = () => div.style.backgroundColor = '#f3f4f6';
                    div.onmouseout = () => div.style.backgroundColor = 'transparent';
                    
                    const title = conv.entity_type === 'general' ? 'General Support' : `${conv.entity_type.toUpperCase()} #${conv.entity_id}`;
                    const unreadObj = conv.unread_count > 0 ? `<span style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:12px;">${conv.unread_count}</span>` : '';
                    
                    div.innerHTML = `
                        <div style="flex:1; overflow:hidden;">
                            <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${title}</div>
                            <div style="font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(conv.last_message || 'No messages')}
                            </div>
                        </div>
                        <div>${unreadObj}</div>
                    `;
                    
                    div.onclick = async () => {
                        UI.inboxView.style.display = 'none';
                        UI.body.style.display = 'flex';
                        document.querySelector('.chat-footer').style.display = 'flex';
                        document.getElementById('chat-back-btn').style.display = 'block';
                        UI.statusText.innerText = title;
                        await loadHistory(conv.id);
                    };
                    
                    UI.inboxView.appendChild(div);
                });
            }
        } catch (err) {
            console.error("Failed to load inbox", err);
        }
    }

    function appendMessage(msg, scroll = true) {
        const isSentByMe = msg.sender_auth_id == authId;
        const div = document.createElement('div');
        div.className = `chat-bubble ${isSentByMe ? 'sent' : 'received'}`;
        
        let html = `<div>${escapeHtml(msg.content)}</div>`;
        
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                if (att.file_type === 'image') {
                    html += `<a href="${att.file_path}" target="_blank" class="chat-attachment"><img src="${att.file_path}" alt="attachment"></a>`;
                } else {
                    html += `<a href="${att.file_path}" target="_blank" class="chat-attachment"><i class="fas fa-file"></i> ${escapeHtml(att.file_name)}</a>`;
                }
            });
        }
        
        const date = new Date(msg.created_at || Date.now());
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const statusStr = isSentByMe ? `<span class="status">${msg.status === 'read' ? 'Read' : 'Delivered'}</span>` : '';
        
        html += `<span class="timestamp">${timeStr} ${statusStr}</span>`;
        div.innerHTML = html;
        
        UI.body.insertBefore(div, UI.typingIndicator);
        if (scroll) scrollToBottom();
    }

    function scrollToBottom() {
        UI.body.scrollTop = UI.body.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    // Public API
    return {
        init: function() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        },

        toggle: function() {
            isWidgetOpen = !isWidgetOpen;
            if (isWidgetOpen) {
                UI.widget.classList.add('active');
                UI.badge.style.display = 'none';
                UI.badge.innerText = '0';
                if (currentConversationId) {
                    markRead(currentConversationId);
                } else {
                    showInbox();
                }
            } else {
                UI.widget.classList.remove('active');
            }
        },

        openContext: async function(entityType, entityId, targetAuthId = 0) {
            try {
                // Ensure widget is open
                if (!isWidgetOpen) this.toggle();
                UI.statusText.innerText = "Loading context...";

                const res = await fetch(`/api/chat/chat.php?action=context&entity_type=${entityType}&entity_id=${entityId}&target_auth_id=${targetAuthId}`);
                const data = await res.json();

                if (data.success) {
                    const newConvId = data.conversation_id;
                    
                    UI.inboxView.style.display = 'none';
                    UI.body.style.display = 'flex';
                    document.querySelector('.chat-footer').style.display = 'flex';
                    document.getElementById('chat-back-btn').style.display = 'block';

                    if (currentConversationId !== newConvId) {
                        await loadHistory(newConvId);
                        UI.statusText.innerText = "Online";
                    } else {
                        UI.statusText.innerText = "Online";
                    }
                }
            } catch (err) {
                console.error("Context error:", err);
                UI.statusText.innerText = "Error loading context";
            }
        },

        sendMessage: async function() {
            if (!currentConversationId) return;
            const content = UI.input.value.trim();
            if (!content) return;

            UI.input.value = '';
            try {
                await fetch('/api/chat/chat.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'send_message',
                        conversation_id: currentConversationId,
                        content: content,
                        message_type: 'text'
                    })
                });
            } catch(e) {}
        },

        handleKeyPress: function(e) {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        },

        handleTyping: function() {
            // Typing indicator not supported in simple polling
        },

        uploadFile: async function(inputElem) {
            const file = inputElem.files[0];
            if (!file || !currentConversationId) return;

            // Optional: send a generic "File uploading..." message first or show loader
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/chat/upload-attachment.php', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                
                if (data.success && data.attachment) {
                    await fetch('/api/chat/chat.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'send_message',
                            conversation_id: currentConversationId,
                            content: 'Sent an attachment',
                            message_type: data.attachment.file_type,
                            attachments: [data.attachment]
                        })
                    });
                } else {
                    alert('Upload failed: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                console.error('Upload error', err);
                alert('Upload failed due to network error.');
            }
            
            // Reset input
            inputElem.value = '';
        }
    };
})();

// Auto init
EventraChat.init();
