import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../../core/widgets/adaptive_dialogs.dart';
import '../providers/tickets_provider.dart';

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
      appBar: AppBar(title: const Text('My Tickets')),
      body: RefreshIndicator(
        onRefresh: provider.load,
        child: provider.isLoading && provider.tickets.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : provider.tickets.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 120),
                      Center(child: Icon(Icons.confirmation_number_outlined, size: 56, color: AppTheme.textMuted)),
                      SizedBox(height: 16),
                      Center(child: Text('No tickets yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
                      SizedBox(height: 8),
                      Center(child: Text('Your purchased tickets will appear here.', style: TextStyle(color: AppTheme.textMuted))),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: provider.tickets.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final ticket = provider.tickets[index];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: SizedBox(
                                  width: 72,
                                  height: 72,
                                  child: ticket.absoluteEventImage != null
                                      ? CachedNetworkImage(imageUrl: ticket.absoluteEventImage!, fit: BoxFit.cover)
                                      : Container(color: AppTheme.primary.withValues(alpha: 0.1), child: const Icon(Icons.event)),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(ticket.eventName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                    const SizedBox(height: 4),
                                    Text(EventUtils.formatDate(ticket.eventDate), style: const TextStyle(color: AppTheme.textMuted)),
                                    const SizedBox(height: 4),
                                    Text('Barcode: ${ticket.barcode}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        StatusChip(ticket.status),
                                        if (ticket.paymentStatus == 'paid') ...[
                                          const SizedBox(width: 8),
                                          const StatusChip('Email sent', color: AppTheme.success),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'Resend email',
                                onPressed: () async {
                                  try {
                                    await provider.resendEmail(ticket);
                                    if (context.mounted) {
                                      await showAdaptiveMessage(context, message: 'Ticket email sent to your inbox.');
                                    }
                                  } catch (e) {
                                    if (context.mounted) {
                                      await showAdaptiveMessage(context, message: e.toString());
                                    }
                                  }
                                },
                                icon: const Icon(Icons.email_outlined),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
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
      child: Text(label, style: TextStyle(fontSize: 11, color: color ?? AppTheme.primary, fontWeight: FontWeight.w600)),
    );
  }
}
