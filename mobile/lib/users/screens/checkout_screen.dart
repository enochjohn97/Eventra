import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../models/event_model.dart';
import '../providers/auth_provider.dart';
import '../services/user_payment_service.dart';
import 'payment_webview_screen.dart';

class CheckoutScreen extends StatefulWidget {
  final EventModel event;
  const CheckoutScreen({super.key, required this.event});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _fnameCtrl;
  late TextEditingController _lnameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  int _quantity = 1;
  final String _ticketType = 'regular';
  bool _processing = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    final parts = (user?.name ?? '').split(' ');
    _fnameCtrl = TextEditingController(text: parts.isNotEmpty ? parts.first : '');
    _lnameCtrl = TextEditingController(text: parts.length > 1 ? parts.sublist(1).join(' ') : '');
    _emailCtrl = TextEditingController(text: user?.email ?? '');
    _phoneCtrl = TextEditingController(text: user?.phone ?? '');
  }

  @override
  void dispose() {
    _fnameCtrl.dispose();
    _lnameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  double get _unitPrice {
    switch (_ticketType) {
      case 'vip':
        return widget.event.vipPrice ?? widget.event.price;
      case 'premium':
        return widget.event.premiumPrice ?? widget.event.price;
      default:
        return widget.event.regularPrice ?? widget.event.price;
    }
  }

  double get _subtotal => _unitPrice * _quantity;
  double get _surcharge => _subtotal * 0.10;
  double get _total => _subtotal + _surcharge;

  Future<void> _pay() async {
    if (!_formKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();
    if (auth.user?.isProfileComplete != true) {
      context.go('/profile-complete');
      return;
    }

    setState(() => _processing = true);
    try {
      final result = await UserPaymentService.initializePayment(
        eventId: widget.event.id,
        quantity: _quantity,
        ticketType: _ticketType,
        contactInfo: {
          'fname': _fnameCtrl.text.trim(),
          'lname': _lnameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
        },
      );

      final reference = result['reference']?.toString() ?? '';
      final isFree = result['is_free'] == true || (result['amount'] is num && (result['amount'] as num) <= 0);

      if (!mounted) return;

      if (isFree) {
        await _verifyAndFinish(reference);
        return;
      }

      final authUrl = result['authorization_url']?.toString();
      if (authUrl == null || authUrl.isEmpty) {
        throw Exception('Payment URL missing from server.');
      }

      final completed = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => PaymentWebViewScreen(
            authorizationUrl: authUrl,
            reference: reference,
          ),
        ),
      );

      if (completed == true) {
        await _verifyAndFinish(reference);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
      }
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _verifyAndFinish(String reference) async {
    final verify = await UserPaymentService.verifyPayment(reference);
    if (!mounted) return;
    context.pushReplacement('/payment-success', extra: {
      'reference': reference,
      'event_name': verify['event_name']?.toString() ?? widget.event.eventName,
      'amount': verify['amount'] ?? _total,
      'barcode': verify['barcode']?.toString(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl = widget.event.absoluteImageUrl ?? ApiClient().absoluteUrl(widget.event.imagePath);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: imageUrl.isNotEmpty
                            ? Image.network(imageUrl, width: 80, height: 80, fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => _thumbPlaceholder())
                            : _thumbPlaceholder(),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.event.eventName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                            const SizedBox(height: 4),
                            Text(EventUtils.formatDate(widget.event.eventDate), style: const TextStyle(color: AppTheme.textMuted)),
                            Text(EventUtils.venueLine(widget.event), style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              const Text('Contact Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: TextFormField(controller: _fnameCtrl, decoration: const InputDecoration(labelText: 'First Name *'), validator: _req)),
                  const SizedBox(width: 12),
                  Expanded(child: TextFormField(controller: _lnameCtrl, decoration: const InputDecoration(labelText: 'Last Name *'), validator: _req)),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _emailCtrl, decoration: const InputDecoration(labelText: 'Email *'), keyboardType: TextInputType.emailAddress, validator: _email),
              const SizedBox(height: 12),
              TextFormField(controller: _phoneCtrl, decoration: const InputDecoration(labelText: 'Phone *'), keyboardType: TextInputType.phone, validator: _req),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Quantity', style: TextStyle(fontWeight: FontWeight.w600)),
                  Row(
                    children: [
                      IconButton(onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null, icon: const Icon(Icons.remove_circle_outline)),
                      Text('$_quantity', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      IconButton(onPressed: () => setState(() => _quantity++), icon: const Icon(Icons.add_circle_outline)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _priceRow('Subtotal', _subtotal),
              _priceRow('Service fee (10%)', _surcharge),
              const Divider(height: 24),
              _priceRow('Total', _total, bold: true),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _processing ? null : _pay,
                  child: _processing
                      ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_total <= 0 ? 'Get Free Ticket' : 'Pay with Paystack'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _thumbPlaceholder() => Container(width: 80, height: 80, color: AppTheme.primary.withValues(alpha: 0.1), child: const Icon(Icons.event));

  Widget _priceRow(String label, double amount, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
          Text(
            amount <= 0 ? 'Free' : '₦${amount.toStringAsFixed(0)}',
            style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: bold ? AppTheme.primary : AppTheme.textMain),
          ),
        ],
      ),
    );
  }

  String? _req(String? v) => (v == null || v.trim().isEmpty) ? 'Required' : null;
  String? _email(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v.trim())) return 'Invalid email';
    return null;
  }
}
