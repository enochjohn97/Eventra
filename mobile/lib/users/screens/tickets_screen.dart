// ignore_for_file: unnecessary_underscores, unnecessary_string_interpolations

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../../core/widgets/brand_logo.dart';
import '../models/ticket_model.dart';
import '../providers/tickets_provider.dart';
import '../services/user_ticket_service.dart';

class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TicketsProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TicketsProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const BrandLogo(
          size: 27,
          markSize: 23,
          animateEveryMinute: true,
        ),
      ),
      body: RefreshIndicator(
        onRefresh: provider.load,
        child: provider.isLoading && provider.tickets.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : provider.tickets.isEmpty && provider.error != null
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 120),
                  Center(
                    child: Text(
                      provider.error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Center(
                    child: Text(
                      'Pull down to retry.',
                      style: TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                ],
              )
            : provider.tickets.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  Center(
                    child: Icon(
                      Icons.confirmation_number_outlined,
                      size: 56,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  SizedBox(height: 16),
                  Center(
                    child: Text(
                      'No tickets yet',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  SizedBox(height: 8),
                  Center(
                    child: Text(
                      'Your purchased tickets will appear here.',
                      style: TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                ],
              )
            : Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: Breakpoints.listMaxWidth(
                      MediaQuery.sizeOf(context).width,
                    ),
                  ),
                  child: ListView.separated(
                    // Always scrollable so a short ticket list can still be
                    // pulled to refresh; longer lists scroll normally.
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    itemCount: provider.tickets.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final ticket = provider.tickets[index];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: SizedBox(
                                  width: 72,
                                  height: 72,
                                  child: ticket.absoluteEventImage != null
                                      ? CachedNetworkImage(
                                          imageUrl: ticket.absoluteEventImage!,
                                          fit: BoxFit.cover,
                                          placeholder: (_, __) => Container(
                                            color: AppTheme.primary.withValues(
                                              alpha: 0.1,
                                            ),
                                            child: const CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: AppTheme.primary,
                                            ),
                                          ),
                                          errorWidget: (_, __, ___) => Container(
                                            color: AppTheme.primary.withValues(
                                              alpha: 0.1,
                                            ),
                                            child: const Icon(Icons.event),
                                          ),
                                        )
                                      : Container(
                                          color: AppTheme.primary.withValues(
                                            alpha: 0.1,
                                          ),
                                          child: const Icon(Icons.event),
                                        ),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      ticket.eventName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      EventUtils.formatDate(ticket.eventDate),
                                      style: const TextStyle(
                                        color: AppTheme.textMuted,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    // Ticket ID with a one-tap copy icon.
                                    Row(
                                      children: [
                                        Flexible(
                                          child: Text(
                                            '${ticketIdOf(ticket)}',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: AppTheme.textMuted,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        InkWell(
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                          onTap: () => copyTicketId(
                                            context,
                                            ticketIdOf(ticket),
                                          ),
                                          child: const Padding(
                                            padding: EdgeInsets.all(3),
                                            child: Icon(
                                              Icons.copy_rounded,
                                              size: 15,
                                              color: AppTheme.primary,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        StatusChip(ticket.status),
                                        if (ticket.paymentStatus == 'paid') ...[
                                          const SizedBox(width: 8),
                                          const StatusChip(
                                            'Email sent',
                                            color: AppTheme.success,
                                          ),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              // Verify / check this ticket (QR + ticket ID),
                              // like the web app's Check Ticket modal. Resending
                              // the email lives inside that modal.
                              IconButton(
                                tooltip: 'Check ticket',
                                onPressed: () => showCheckTicketDialog(
                                  context,
                                  initialTicketId: ticketIdOf(ticket),
                                ),
                                icon: const Icon(Icons.qr_code_scanner),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  final String label;
  final Color? color;
  const StatusChip(this.label, {super.key, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: (color ?? AppTheme.primary).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          color: color ?? AppTheme.primary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// The ID a user (or a gate scanner) types into the check form. The barcode is
/// the canonical ticket ID and is always present.
String ticketIdOf(TicketModel ticket) =>
    ticket.barcode.isNotEmpty ? ticket.barcode : (ticket.customId ?? '');

Future<void> copyTicketId(BuildContext context, String ticketId) async {
  if (ticketId.isEmpty) return;
  await Clipboard.setData(ClipboardData(text: ticketId));
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text('Ticket ID $ticketId copied'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
}

/// Sizable, scrollable ticket-check modal: QR preview for the entered ticket ID
/// plus unlimited verification by ID — the mobile mirror of the website's
/// "Check Ticket" component.
Future<void> showCheckTicketDialog(
  BuildContext context, {
  String initialTicketId = '',
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (_) => _CheckTicketDialog(initialTicketId: initialTicketId),
  );
}

class _CheckTicketDialog extends StatefulWidget {
  final String initialTicketId;

  const _CheckTicketDialog({this.initialTicketId = ''});

  @override
  State<_CheckTicketDialog> createState() => _CheckTicketDialogState();
}

class _CheckTicketDialogState extends State<_CheckTicketDialog> {
  late final TextEditingController _idCtrl;
  Map<String, dynamic>? _proof;
  String? _error;
  bool _verifying = false;
  bool _loadingQr = false;
  String? _qrDataUri;
  String? _qrError;
  String? _qrMeta;

  /// True once the ticket's five QR scans are used up — the ticket ID field
  /// stays available (and unlimited) after that, exactly like the web flow.
  bool _qrLocked = false;

  @override
  void initState() {
    super.initState();
    _idCtrl = TextEditingController(text: widget.initialTicketId);
    if (widget.initialTicketId.trim().isNotEmpty) {
      _loadQr(widget.initialTicketId.trim());
      _verify();
    }
  }

  @override
  void dispose() {
    _idCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadQr(String ticketId) async {
    if (ticketId.length < 4) return;
    setState(() {
      _loadingQr = true;
      _qrDataUri = null;
      _qrError = null;
      _qrMeta = null;
      _qrLocked = false;
    });
    try {
      final qr = await UserTicketService.fetchTicketQr(ticketId);
      final imageData = UriData.parse(qr.dataUri);
      if (!imageData.mimeType.startsWith('image/') ||
          imageData.contentAsBytes().isEmpty) {
        throw Exception('The server returned an invalid QR image.');
      }
      if (!mounted) return;
      setState(() {
        _qrDataUri = qr.dataUri;
        _qrLocked = qr.scansRemaining <= 0;
        _qrMeta =
            'Ticket ${ticketId.toUpperCase()} · ${qr.scansUsed}/${qr.scanLimit} QR scans used · ${qr.scansRemaining} remaining';
      });
    } catch (e) {
      if (!mounted) return;
      final message = e is FormatException
          ? 'The server returned an invalid QR image.'
          : e.toString().replaceFirst('Exception: ', '');
      final locked = message.toLowerCase().contains('limit');
      setState(() {
        _qrLocked = locked;
        _qrError = locked
            ? 'QR scans used up (5/5). This QR code is now inaccessible — verify with the Ticket ID below instead.'
            : message;
      });
    } finally {
      if (mounted) setState(() => _loadingQr = false);
    }
  }

  Future<void> _verify() async {
    final ticketId = _idCtrl.text.trim();
    if (ticketId.isEmpty) {
      setState(() => _error = 'Enter a ticket ID — e.g. TKT-20260929-0697');
      return;
    }
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final proof = await UserTicketService.checkTicket(ticketId);
      if (!mounted) return;
      setState(() {
        _proof = proof;
        _verifying = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _verifying = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 560,
          maxHeight: size.height * 0.9,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Check Ticket',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Prove ticket validity — protects against fraud and ticket reuse.',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: _proof != null
                    ? _proofView(_proof!, verifiedBy: 'id')
                    : _formView(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _formView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Ticket QR code',
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(
          'Generated from the ticket ID — scannable by any phone.',
          style: TextStyle(fontSize: 11.5, color: AppTheme.textMuted),
        ),
        const SizedBox(height: 10),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE5E7EB)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              if (_loadingQr)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: CircularProgressIndicator(),
                )
              else if (_qrDataUri != null && _qrDataUri!.isNotEmpty)
                _qrPreview()
              else
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Column(
                    children: [
                      Icon(
                        _qrLocked ? Icons.lock_outline : Icons.qr_code_2,
                        size: 40,
                        color: _qrLocked ? AppTheme.error : AppTheme.textMuted,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _qrError ??
                            'Enter a ticket ID below — the QR code appears here.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11.5,
                          color: _qrLocked
                              ? AppTheme.error
                              : AppTheme.textMuted,
                          fontWeight: _qrLocked ? FontWeight.w600 : null,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if (_qrMeta != null) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _qrMeta!,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.primary,
              ),
            ),
          ),
        ],
        const SizedBox(height: 20),
        const Text(
          'Verify by ticket ID',
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(
          'Unlimited checks — works even when QR scans run out.',
          style: TextStyle(fontSize: 11.5, color: AppTheme.textMuted),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _idCtrl,
          textCapitalization: TextCapitalization.characters,
          onSubmitted: (_) => _verify(),
          onChanged: (value) {
            final id = value.trim();
            if (id.length >= 6) {
              _loadQr(id);
            }
          },
          decoration: const InputDecoration(
            hintText: 'e.g. TKT-20260929-0697',
            prefixIcon: Icon(Icons.confirmation_number_outlined),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppTheme.error.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              _error!,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _verifying ? null : _verify,
            child: _verifying
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Verify Ticket'),
          ),
        ),
      ],
    );
  }

  Widget _qrPreview() {
    final imageData = UriData.parse(_qrDataUri!);
    final bytes = imageData.contentAsBytes();
    if (imageData.mimeType == 'image/svg+xml') {
      return SvgPicture.memory(
        bytes,
        width: 190,
        height: 190,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => const Icon(
          Icons.broken_image_outlined,
          size: 40,
          color: AppTheme.textMuted,
        ),
      );
    }
    return Image.memory(
      bytes,
      width: 190,
      height: 190,
      fit: BoxFit.contain,
      errorBuilder: (_, _, _) => const Icon(
        Icons.broken_image_outlined,
        size: 40,
        color: AppTheme.textMuted,
      ),
    );
  }

  Widget _proofView(Map<String, dynamic> proof, {required String verifiedBy}) {
    final image = proof['event_image']?.toString() ?? '';
    final status = proof['ticket_status']?.toString() ?? 'Valid';
    final statusColor = status.toLowerCase() == 'valid'
        ? AppTheme.success
        : (status.toLowerCase() == 'used'
              ? const Color(0xFFD97706)
              : AppTheme.error);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.success.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.verified, size: 18, color: AppTheme.success),
              SizedBox(width: 6),
              Text(
                'Ticket verified successfully',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: AppTheme.success,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (image.isNotEmpty)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: CachedNetworkImage(
              imageUrl: image,
              height: 160,
              width: double.infinity,
              fit: BoxFit.cover,
              placeholder: (_, __) => Container(
                color: AppTheme.primary.withValues(alpha: 0.08),
                child: const Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppTheme.primary,
                  ),
                ),
              ),
              errorWidget: (_, __, ___) => Container(
                height: 160,
                color: AppTheme.primary.withValues(alpha: 0.08),
              ),
            ),
          ),
        const SizedBox(height: 12),
        Text(
          proof['event_name']?.toString() ?? 'Event',
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if ((proof['ticket_type']?.toString() ?? '').isNotEmpty)
              StatusChip(proof['ticket_type'].toString()),
            if ((proof['price_display']?.toString() ?? '').isNotEmpty)
              StatusChip(
                proof['price_display'].toString(),
                color: AppTheme.accent,
              ),
            StatusChip(status, color: statusColor),
            StatusChip(
              verifiedBy == 'id' ? 'Verified by Ticket ID' : 'Verified by QR',
              color: AppTheme.success,
            ),
          ],
        ),
        const SizedBox(height: 14),
        _proofRow(
          'Payment / transaction date',
          _fmtDate(proof['payment_date']),
        ),
        _proofRow(
          'Event date & time',
          '${_fmtDate(proof['event_date'])}'
              '${(proof['event_time']?.toString() ?? '').isNotEmpty ? ' · ${proof['event_time']}' : ''}',
        ),
        _proofRow('Event ID', proof['event_custom_id']?.toString() ?? '—'),
        _proofRow('Ticket ID', proof['ticket_id']?.toString() ?? '—'),
        _proofRow(
          'Payment reference',
          proof['payment_reference']?.toString() ?? '—',
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  final currentId = _idCtrl.text.trim();
                  setState(() {
                    _proof = null;
                    _qrDataUri = null;
                    _qrMeta = null;
                    _qrError = null;
                    _qrLocked = false;
                  });
                  // Re-fetch the QR for the ID still in the field, otherwise
                  // the preview came back empty after leaving the proof view.
                  if (currentId.isNotEmpty) _loadQr(currentId);
                },
                child: const Text('Check another'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _proofRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// "2026-09-29 16:00:00" → "Sep 29, 2026 · 4:00 PM".
  static String _fmtDate(dynamic raw) {
    final value = raw?.toString() ?? '';
    if (value.isEmpty || value == 'null') return '—';
    final parsed = DateTime.tryParse(value.replaceFirst(' ', 'T'));
    if (parsed == null) return value;
    return DateFormat('MMM d, yyyy · h:mm a').format(parsed);
  }
}
