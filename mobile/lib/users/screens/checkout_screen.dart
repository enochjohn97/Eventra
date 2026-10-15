import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../../core/widgets/brand_logo.dart';
import '../models/event_model.dart';
import '../models/user_model.dart';
import '../providers/auth_provider.dart';
import '../services/user_payment_service.dart';
import '../utils/checkout_navigation.dart';
import 'payment_webview_screen.dart';

class CheckoutScreen extends StatefulWidget {
  final EventModel event;
  const CheckoutScreen({super.key, required this.event});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _fnameCtrl;
  late TextEditingController _lnameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  int _quantity = 1;
  late String _ticketType;
  bool _processing = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    final parts = (user?.name ?? '').split(' ');

    _fnameCtrl = TextEditingController(
      text: parts.isNotEmpty ? parts.first : '',
    );
    _lnameCtrl = TextEditingController(
      text: parts.length > 1 ? parts.sublist(1).join(' ') : '',
    );
    _emailCtrl = TextEditingController(text: user?.email ?? '');
    _phoneCtrl = TextEditingController(text: user?.phone ?? '');

    // Only tiers the organizer actually enabled are selectable; default to
    // the cheapest active tier so the buyer always sees a correct amount.
    final tiers = EventUtils.activeTiers(
      widget.event,
    ).where((t) => EventUtils.basePriceForTier(widget.event, t) >= 0).toList();
    _ticketType = tiers.first;

    if (user != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _maybePrefillFromProfile(user);
      });
    }
  }

  @override
  void dispose() {
    _fnameCtrl.dispose();
    _lnameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  /// Base tier price (before fee) — exactly what the backend charges for.
  /// Falls back to the legacy `price` for events whose tier columns are empty
  /// so a paid event can never be mistaken for a free one.
  double get _unitPrice {
    final base = EventUtils.basePriceForTier(widget.event, _ticketType);
    if (base > 0) return base;
    return widget.event.price > 0 ? widget.event.price : 0;
  }

  double get _subtotal => _unitPrice * _quantity;
  double get _surcharge => _subtotal * 0.10;
  double get _total => _subtotal + _surcharge;

  Future<void> _pay() async {
    if (!_formKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();
    // Checkout collects the contact details it needs, so only an actual
    // sign-out blocks payment — an incomplete profile must not divert users
    // away from the Paystack page.
    if (auth.status == AuthStatus.unauthenticated) {
      PendingCheckout.event = widget.event;
      context.go('/login');
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
      final isFree =
          result['is_free'] == true ||
          (result['amount'] is num && (result['amount'] as num) <= 0);

      if (!mounted) return;

      if (isFree) {
        // Free tickets are issued synchronously inside initialize; a verify
        // call confirms the order row landed (and catches rare failures).
        final outcome = await _verifyWithRetry(reference);
        _showPaymentOutcome(reference, result, outcome);
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

      if (!mounted) return;
      if (completed != true) return; // user closed checkout — keep it open

      // The webview returning only means Paystack redirected back. The order
      // is fulfilled by the backend's Paystack webhook; verify-payment
      // returns "processing" while that is still in flight. Poll it.
      final outcome = await _verifyWithRetry(reference);
      _showPaymentOutcome(reference, result, outcome);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  /// Polls the backend's verify endpoint, mirroring how the web app resolves
  /// payments (webhook-driven, with client verify as the synchronous check).
  ///
  /// Server outcomes:
  ///  * success    — order fulfilled (webhook already done, or verify claimed it)
  ///  * processing — webhook mid-flight; poll again shortly
  ///  * failure    — Paystack says failed, or verify couldn't run
  Future<_PaymentOutcome> _verifyWithRetry(String reference) async {
    if (reference.isEmpty) return _PaymentOutcome.failure;
    // Webhook is normally near-instant; keep polling up to ~15s.
    const attempts = 6;
    const delay = Duration(seconds: 2);
    for (var i = 0; i < attempts; i++) {
      try {
        final data = await UserPaymentService.verifyPayment(reference);
        final status = data['status']?.toString();
        if (status == 'success') return _PaymentOutcome.success;
        if (status == 'processing') {
          await Future<void>.delayed(delay);
          continue;
        }
        return _PaymentOutcome.failure;
      } catch (_) {
        // Transient network error — poll again rather than fail the flow.
        await Future<void>.delayed(delay);
      }
    }
    return _PaymentOutcome.pending;
  }

  void _showPaymentOutcome(
    String reference,
    Map<String, dynamic> result,
    _PaymentOutcome outcome,
  ) {
    if (!mounted) return;
    if (outcome == _PaymentOutcome.failure) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't confirm your payment. If you were charged, your tickets will appear in 'My Tickets' shortly.",
          ),
        ),
      );
      return;
    }
    context.pushReplacement(
      '/payment-success',
      extra: {
        'reference': reference,
        'event_name':
            result['event_name']?.toString() ?? widget.event.eventName,
        'amount': result['amount'] ?? _total,
        'payment_pending': outcome == _PaymentOutcome.pending,
      },
    );
  }

  Future<void> _showIncompleteProfileDialog() async {
    if (!mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('Update your profile first'),
        content: const Text(
          'You’re all set to checkout — your profile already has your name, email, phone, and payment details. Please complete your profile to continue.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
            },
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.pushReplacement('/profile-complete');
            },
            child: const Text('Update Profile'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl =
        widget.event.absoluteImageUrl ??
        ApiClient().absoluteUrl(widget.event.imagePath);
    final formWidth = Breakpoints.formMaxWidth(
      MediaQuery.sizeOf(context).width,
    );

    return Scaffold(
      appBar: AppBar(
        title: const BrandLogo(
          size: 27,
          markSize: 23,
          animateEveryMinute: true,
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: formWidth),
          child: SingleChildScrollView(
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
                                ? Image.network(
                                    imageUrl,
                                    width: 80,
                                    height: 80,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) =>
                                        _thumbPlaceholder(),
                                  )
                                : _thumbPlaceholder(),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.event.eventName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  EventUtils.formatDate(widget.event.eventDate),
                                  style: const TextStyle(
                                    color: AppTheme.textMuted,
                                  ),
                                ),
                                Text(
                                  EventUtils.venueLine(widget.event),
                                  style: const TextStyle(
                                    color: AppTheme.textMuted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Contact Information',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _fnameCtrl,
                          decoration: const InputDecoration(
                            labelText: 'First Name *',
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'[A-Za-zÀ-ÖØ-öø-ÿ ]'),
                            ),
                          ],
                          autovalidateMode: AutovalidateMode.onUserInteraction,
                          validator: (value) => _name(value, 'first name'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _lnameCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Last Name *',
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'[A-Za-zÀ-ÖØ-öø-ÿ ]'),
                            ),
                          ],
                          autovalidateMode: AutovalidateMode.onUserInteraction,
                          validator: (value) => _name(value, 'last name'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _emailCtrl,
                    decoration: const InputDecoration(labelText: 'Email *'),
                    keyboardType: TextInputType.emailAddress,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    validator: _email,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneCtrl,
                    decoration: const InputDecoration(labelText: 'Phone *'),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    validator: _phone,
                  ),
                  const SizedBox(height: 20),
                  // Ticket tier picker — only the tiers the organizer enabled
                  // (mode "all" is a single legacy price, exactly like the web),
                  // each showing the amount that tier is actually charged.
                  if (EventUtils.showTierSelector(widget.event)) ...[
                    const Text(
                      'Ticket Type',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _tierSelector(),
                    const SizedBox(height: 16),
                  ],
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Quantity',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Row(
                        children: [
                          IconButton(
                            onPressed: _quantity > 1
                                ? () => setState(() => _quantity--)
                                : null,
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text(
                            '$_quantity',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          IconButton(
                            onPressed: () => setState(() => _quantity++),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _priceRow(
                    'Subtotal (${_ticketType[0].toUpperCase()}${_ticketType.substring(1)} × $_quantity)',
                    _subtotal,
                  ),
                  _priceRow('Service fee (10%)', _surcharge),
                  const Divider(height: 24),
                  _priceRow('Total', _total, bold: true),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _processing ? null : _pay,
                      child: _processing
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              _total <= 0
                                  ? 'Get Free Ticket'
                                  : 'Pay with Paystack',
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Tier chips: selected tier is filled with the brand blue and its label is
  /// white, unselected tiers stay white with a hairline border.
  Widget _tierSelector() {
    final tiers = EventUtils.activeTiers(widget.event);
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final tier in tiers)
          Builder(
            builder: (context) {
              final selected = tier == _ticketType;
              return Material(
                color: selected ? AppTheme.primary : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: selected
                        ? AppTheme.primary
                        : const Color(0xFFE5E7EB),
                    width: 1.5,
                  ),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setState(() => _ticketType = tier),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 9,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (selected) ...[
                          const Icon(
                            Icons.check,
                            size: 15,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 6),
                        ],
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              EventUtils.tierName(tier),
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: selected
                                    ? Colors.white
                                    : AppTheme.textMain,
                              ),
                            ),
                            Text(
                              EventUtils.tierPriceLabel(widget.event, tier),
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: selected
                                    ? Colors.white
                                    : AppTheme.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _thumbPlaceholder() => Container(
    width: 80,
    height: 80,
    color: AppTheme.primary.withValues(alpha: 0.1),
    child: const Icon(Icons.event),
  );

  void _maybePrefillFromProfile(UserModel? user) {
    if (user == null) return;
    if ((user.phone?.trim().isNotEmpty ?? false) &&
        (user.dob?.trim().isNotEmpty ?? false) &&
        (user.gender?.trim().isNotEmpty ?? false) &&
        (user.country?.trim().isNotEmpty ?? false) &&
        (user.state?.trim().isNotEmpty ?? false) &&
        (user.city?.trim().isNotEmpty ?? false) &&
        (user.address?.trim().isNotEmpty ?? false)) {
      final parts = user.name.split(' ');
      _fnameCtrl.text = parts.isNotEmpty ? parts.first : '';
      _lnameCtrl.text = parts.length > 1 ? parts.sublist(1).join(' ') : '';
    } else {
      _showIncompleteProfileDialog();
    }
  }

  Widget _priceRow(String label, double amount, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
          Text(
            amount <= 0 ? 'Free' : '₦${amount.toStringAsFixed(0)}',
            style: TextStyle(
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: bold ? AppTheme.primary : AppTheme.textMain,
            ),
          ),
        ],
      ),
    );
  }

  String? _name(String? value, String label) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Enter your $label';
    if (!RegExp(
      r"^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: +[A-Za-zÀ-ÖØ-öø-ÿ]+)*$",
    ).hasMatch(text.trim())) {
      return 'Use letters only';
    }
    return null;
  }

  String? _email(String? v) {
    if (v == null || v.trim().isEmpty) return 'Required';
    if (!_isValidEmail(v.trim())) {
      return 'Enter a valid email address';
    }
    return null;
  }

  String? _phone(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Enter your phone number';
    if (!RegExp(r'^\d+$').hasMatch(text)) return 'Digits only';
    return null;
  }

  bool _isValidEmail(String value) => RegExp(
    r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$",
    caseSensitive: false,
  ).hasMatch(value);
}

enum _PaymentOutcome { success, pending, failure }
