// Notification Manager for Admin
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.pollingInterval = null;
    this.pollingDelay = 20000; // 20s — keeps sections in near-real-time without hammering the DB under load
  }

  async fetchNotifications() {
    try {
      const response = await apiFetch(
        "/api/notifications/get-admin-notifications.php",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const result = await response.json();

      if (result.success) {
        this.notifications = Array.from(
          new Map(
            (result.notifications || []).map((notification) => [
              notification.id,
              notification,
            ]),
          ).values(),
        );
        this.unreadCount = result.unread_count;
        this.updateNotificationUI();
        return result;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  updateNotificationUI() {
    // Update badge
    this.updateNotificationBadge();

    // Update drawer content
    this.renderNotifications();
  }

  async clearAllNotifications() {
    try {
      const response = await apiFetch("/api/notifications/clear-all.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (result.success) {
        this.notifications = [];
        this.renderNotifications();
        this.updateNotificationBadge(); // Assuming updateBellBadge refers to updateNotificationBadge
        if (window.showNotification) {
          showNotification("All notifications cleared", "success");
        }
      }
    } catch (error) {}
  }

  updateNotificationBadge() {
    const bellIcon =
      document.getElementById("notificationBellIcon") ||
      document.querySelector(".notification-bell-icon");
    if (!bellIcon) return;

    // Remove existing badge
    const existingBadge = bellIcon.querySelector(".notification-badge");
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add badge if there are unread notifications
    if (this.unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "notification-badge";
      badge.textContent = this.unreadCount > 99 ? "99+" : this.unreadCount;
      badge.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ef4444;
                color: white;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                border: 2px solid white;
            `;
      bellIcon.style.position = "relative";
      bellIcon.appendChild(badge);
    }
  }

  renderNotifications() {
    const drawerContent = document.querySelector(
      "#notificationsDrawer .drawer-content",
    );
    const drawerHeader = document.querySelector(
      "#notificationsDrawer .drawer-header",
    );
    if (!drawerContent || !drawerHeader) return;

    // Add Clear All button to header if it doesn't exist and there are notifications
    let clearBtn = drawerHeader.querySelector(".clear-all-btn");
    if (this.notifications.length > 0) {
      if (!clearBtn) {
        clearBtn = document.createElement("button");
        clearBtn.className = "clear-all-btn";
        clearBtn.textContent = "Clear All";
        clearBtn.style.cssText =
          "background: #f1f5f9; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s;";
        clearBtn.onclick = () => this.clearAll();
        drawerHeader.appendChild(clearBtn);
      }
    } else if (clearBtn) {
      clearBtn.remove();
    }

    // Clear existing content
    drawerContent.textContent = "";

    if (this.notifications.length === 0) {
      drawerContent.innerHTML = `
                <div class="empty-notif-state" style="text-align: center; padding: 4rem 2rem; color: #94a3b8; animation: fadeIn 0.5s ease-out;">
                    <div style="font-size: 4rem; margin-bottom: 1.5rem; filter: grayscale(0.5);">🎉</div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">All caught up!</h3>
                    <p style="font-size: 0.9rem;">You have no new notifications at the moment.</p>
                </div>
            `;
      return;
    }

    // Container for notifications
    const listContainer = document.createElement("div");
    listContainer.className = "notif-list-container";
    drawerContent.appendChild(listContainer);

    // Render each notification
    this.notifications.forEach((notif) => {
      const notifItem = this.createNotificationElement(notif);
      listContainer.appendChild(notifItem);
    });
  }

  createNotificationElement(notif) {
    const notifItem = document.createElement("div");
    notifItem.className = "notif-item";
    if (!notif.is_read) {
      notifItem.classList.add("unread");
    }

    // Format date and time
    const date = new Date(notif.created_at);
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });

    // Icon based on notification type
    const icons = {
      info: "🔔",
      success: "✓",
      warning: "⚠",
      error: "✕",
    };

    notifItem.innerHTML = `
            <div class="notif-icon">${icons[notif.type] || icons.info}</div>
            <div class="notif-body">
                <p class="notif-text">${escapeHtml(notif.message)}</p>
                <div class="notif-meta">
                    <span>${timeStr}</span>
                    <span>${dateStr}</span>
                </div>
            </div>
        `;

    // Add click event to mark as read
    if (!notif.is_read) {
      notifItem.style.cursor = "pointer";
      notifItem.addEventListener("click", () => {
        this.markAsRead(notif.id);
        notifItem.classList.remove("unread");
        notifItem.style.cursor = "default";
      });
    }

    return notifItem;
  }

  async markAsRead(notificationId = null) {
    try {
      const body = notificationId
        ? { notification_id: notificationId }
        : { mark_all: true };

      const response = await apiFetch(
        "/api/notifications/mark-notification-read.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const result = await response.json();

      if (result.success) {
        // Refresh notifications
        await this.fetchNotifications();
      }
    } catch (error) {}
  }

  async clearAll() {
    const result = await Swal.fire({
      title: "Clear All Notifications?",
      text: "Are you sure you want to delete all your notifications? This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e74c3c",
      cancelButtonColor: "#95a5a6",
      confirmButtonText: "Yes, Clear All",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await apiFetch("/api/notifications/clear-all.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (result.success) {
        this.notifications = [];
        this.unreadCount = 0;
        this.updateNotificationUI();
        if (typeof showToast === "function")
          showToast("All notifications cleared", "success");
      }
    } catch (error) {}
  }

  startPolling() {
    // Initial fetch
    this.fetchNotifications();

    // Set up polling
    this.pollingInterval = setInterval(() => {
      this.fetchNotifications();
    }, this.pollingDelay);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

// Create global instance
window.notificationManager = new NotificationManager();

// Auto-start polling when page loads
document.addEventListener("DOMContentLoaded", () => {
  if (window.notificationManager) {
    window.notificationManager.startPolling();
  }

  // Add click handler for notification bell
  const bellIcon =
    document.getElementById("notificationBellIcon") ||
    document.querySelector(".notification-bell-icon");
  if (bellIcon) {
    bellIcon.addEventListener("click", () => {
      const drawer = document.getElementById("notificationsDrawer");
      if (drawer) {
        drawer.classList.add("open");
      }
    });
  }
});
