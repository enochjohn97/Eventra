import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/theme/app_theme.dart';
import '../services/user_ticket_service.dart';

class PaymentSuccessScreen extends StatefulWidget {
  final Map<String, dynamic> payload;
  const PaymentSuccessScreen({super.key, required this.payload});

  @override
  State<PaymentSuccessScreen> createState() => _PaymentSuccessScreenState();
}

class _PaymentSuccessScreenState extends State<PaymentSuccessScreen> {
  bool _sending = false;

  Future<void> _resendEmail() async {
    setState(() => _sending = true);
    try {
      await UserTicketService.sendTicketEmail(reference: widget.payload['reference']?.toString());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ticket email sent!')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eventName = widget.payload['event_name']?.toString() ?? 'Event';
    final reference = widget.payload['reference']?.toString() ?? '';
    final barcode = widget.payload['barcode']?.toString() ?? reference;
    final amount = widget.payload['amount'];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(color: AppTheme.success.withValues(alpha: 0.12), shape: BoxShape.circle),
                child: const Icon(Icons.check_circle, color: AppTheme.success, size: 56),
              ),
              const SizedBox(height: 20),
              const Text('Payment Successful!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(eventName, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textMuted)),
              if (amount != null) ...[
                const SizedBox(height: 8),
                Text('Amount: ₦$amount', style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 24),
              if (barcode.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 12)],
                  ),
                  child: QrImageView(data: barcode, size: 180, backgroundColor: Colors.white),
                ),
              const SizedBox(height: 12),
              Text('Reference: $reference', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _sending ? null : _resendEmail,
                  child: _sending ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Resend Ticket Email'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => context.go('/home'),
                  child: const Text('Back to Home'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
