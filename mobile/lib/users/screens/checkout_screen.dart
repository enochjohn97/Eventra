// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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

  /// "Get for someone else": the buyer pays, the recipient owns the ticket.
  /// Only the recipient's email is collected under Contact Information.
  final bool giftMode;

  const CheckoutScreen({
    super.key,
    required this.event,
    this.giftMode = false,
  });

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
  final TextEditingController _giftNameCtrl = TextEditingController();
  final TextEditingController _giftEmailCtrl = TextEditingController();
  final TextEditingController _giftPhoneCtrl = TextEditingController();
  int _quantity = 1;
  late String _ticketType;
  bool _processing = false;
  int _giftCreationsLeft = 50;
  String? _giftWarning;
  bool _giftLimitExceeded = false;
  GiftStoreLinks? _giftStoreLinks;

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

    if (widget.giftMode) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _checkGiftQuota();
      });
    }
  }

  Future<void> _checkGiftQuota() async {
    final quota = await UserPaymentService.checkRecipientQuota();
    if (!mounted) return;
    setState(() {
      _giftCreationsLeft = quota.creationsLeft;
      _giftWarning = quota.warning;
      _giftLimitExceeded = quota.limitExceeded;
      _giftStoreLinks = quota.storeLinks;
    });
    if (quota.limitExceeded) {
      _showGiftLimitModal(storeLinks: quota.storeLinks);
    }
  }

  @override
  void dispose() {
    _fnameCtrl.dispose();
    _lnameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _giftNameCtrl.dispose();
    _giftEmailCtrl.dispose();
    _giftPhoneCtrl.dispose();
    super.dispose();
  }

  /// Recipient address for a gift purchase, or null for a normal checkout.
  String? get _giftRecipientEmail => widget.giftMode
      ? _giftEmailCtrl.text.trim()
      : null;

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

  /// Tickets left for the selected tier, straight from the organizer's limit.
  /// `null` means the organizer set no limit for this tier.
  int? get _remainingForTier => widget.event.remainingForTier(_ticketType);

  /// Capacity the organizer set for the selected tier.
  int? get _capacityForTier => widget.event.capacityForTier(_ticketType);

  /// Hard upper bound for quantity: per-tier remaining → tier capacity → total event tickets → null.
  int? get _maxQuantity {
    final rem = _remainingForTier;
    if (rem != null) return rem;
    final cap = _capacityForTier;
    if (cap != null) return cap;
    return widget.event.ticketCount; // total tickets on the event
  }

  bool _tierSoldOut(String tier) {
    final remaining = widget.event.remainingForTier(tier);
    return remaining != null && remaining <= 0;
  }

  /// Keeps the quantity inside the selected tier's remaining stock. Changing
  /// tier never leaves a stale quantity that the organizer's limit rejects.
  void _clampQuantity() {
    final max = _maxQuantity;
    if (max != null && _quantity > max) _quantity = max.clamp(1, max);
    if (_quantity < 1) _quantity = 1;
  }

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

    if (widget.giftMode && _giftLimitExceeded) {
      _showGiftLimitModal();
      return;
    }

    setState(() => _processing = true);
    try {
      final initResult = await UserPaymentService.initializePayment(
        eventId: widget.event.id,
        quantity: _quantity,
        ticketType: _ticketType,
        contactInfo: {
          'fname': _fnameCtrl.text.trim(),
          'lname': _lnameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
        },
        giftRecipientEmail: _giftRecipientEmail,
        giftRecipientName: widget.giftMode ? _giftNameCtrl.text.trim() : null,
        giftRecipientPhone: widget.giftMode ? _giftPhoneCtrl.text.trim() : null,
      );

      final reference = initResult.reference;

      if (!mounted) return;

      if (initResult.giftWarning != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(initResult.giftWarning!),
            backgroundColor: const Color(0xFFD97706),
            duration: const Duration(seconds: 4),
          ),
        );
      }

      if (initResult.isFree) {
        // Free tickets are issued synchronously inside initialize; a verify
        // call confirms the order row landed (and catches rare failures).
        final outcome = await _verifyWithRetry(reference);
        _showPaymentOutcome(reference, initResult.raw, outcome);
        return;
      }

      final authUrl = initResult.authorizationUrl;
      if (authUrl.isEmpty) {
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
      _showPaymentOutcome(reference, initResult.raw, outcome);
    } on GiftLimitExceededException catch (e) {
      setState(() {
        _giftLimitExceeded = true;
        _giftCreationsLeft = 0;
      });
      if (mounted) await _showGiftLimitModal(storeLinks: e.storeLinks);
    } on GiftRecipientNotRegisteredException catch (e) {
      if (mounted) await _showRecipientNotRegistered(e);
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

  /// Shown when a gift recipient has no EventOut account: hands the buyer the
  /// Google Play / App Store link so the recipient can install the app and
  /// register, after which the same checkout can be retried.
  Future<void> _showRecipientNotRegistered(
    GiftRecipientNotRegisteredException error,
  ) async {
    final email = _giftEmailCtrl.text.trim();
    Future<void> openStore(String url) async {
      final uri = Uri.tryParse(url);
      if (uri != null && await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('No EventOut account yet'),
        content: Text(
          '$email is not registered on EventOut. Send them the ${Theme.of(context).platform == TargetPlatform.iOS ? 'App Store' : 'Google Play'} link to install the app and create the account, then verify the address again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              openStore(error.storeLinks.android);
            },
            child: const Text('Google Play'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              openStore(error.storeLinks.ios);
            },
            child: const Text('App Store'),
          ),
        ],
      ),
    );
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

  /// Shows the gift-limit exceeded modal. When the user hits 50 temporary
  /// account creations, recipients must download EventOut themselves.
  Future<void> _showGiftLimitModal({GiftStoreLinks? storeLinks}) async {
    if (!mounted) return;
    final links = storeLinks ?? _giftStoreLinks;
    Future<void> openStore(String url) async {
      final uri = Uri.tryParse(url);
      if (uri != null && await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.block, color: AppTheme.error, size: 36),
        title: const Text(
          'Limit Exceeded',
          textAlign: TextAlign.center,
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'You have exceeded the limit of 50 temporary accounts.\n\n'
              'The email address that has been used to create a temporary account so they can get the ticket should download the app through Google Play or App Store, create their own account, and purchase directly.',
              textAlign: TextAlign.center,
            ),
            if (links != null) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton.icon(
                    onPressed: () => openStore(links.android),
                    icon: const Icon(Icons.android, size: 18),
                    label: const Text('Google Play'),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: () => openStore(links.ios),
                    icon: const Icon(Icons.apple, size: 18),
                    label: const Text('App Store'),
                  ),
                ],
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
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
        title: widget.giftMode
            ? const Text(
                'Get for someone else',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
              )
            : const BrandLogo(
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
                  Text(
                    widget.giftMode
                        ? 'Recipient Information'
                        : 'Contact Information',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (widget.giftMode) ...[
                    if (_giftLimitExceeded) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppTheme.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppTheme.error.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.block, color: AppTheme.error, size: 24),
                            const SizedBox(width: 10),
                            const Expanded(
                              child: Text(
                                'You have exceeded the limit of 50 temporary accounts. Recipients should download EventOut via Google Play or App Store to access their tickets.',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.error,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else if (_giftWarning != null || (_giftCreationsLeft <= 5 && _giftCreationsLeft > 0)) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: const Color(0xFFF59E0B).withValues(alpha: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.warning_amber_rounded,
                              color: Color(0xFFB45309),
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _giftWarning ??
                                    'Warning: You have only $_giftCreationsLeft creation${_giftCreationsLeft == 1 ? '' : 's'} left (out of 50 limit).',
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF92400E),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    // Name (validated, no digits or symbols) required
                    TextFormField(
                      controller: _giftNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Recipient Name *',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      keyboardType: TextInputType.name,
                      textCapitalization: TextCapitalization.words,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r"[a-zA-Z\s'-]"),
                        ),
                      ],
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      validator: (value) {
                        final v = value?.trim() ?? '';
                        if (v.isEmpty) return 'Recipient name is required';
                        if (!RegExp(r"^[a-zA-Z\s'-]+$").hasMatch(v)) {
                          return 'Name cannot contain digits or symbols';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    // Email address (validated) required
                    TextFormField(
                      controller: _giftEmailCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Recipient Email *',
                        prefixIcon: Icon(Icons.email_outlined),
                        helperText:
                            'The ticket will be issued to their EventOut account.',
                      ),
                      keyboardType: TextInputType.emailAddress,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      validator: _email,
                    ),
                    const SizedBox(height: 12),
                    // Recipient phone number (required, 11 digits only)
                    TextFormField(
                      controller: _giftPhoneCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Recipient Phone Number *',
                        prefixIcon: Icon(Icons.phone_outlined),
                        helperText: '11 digits only (e.g. 08012345678)',
                      ),
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(11),
                      ],
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      validator: (value) {
                        final v = value?.trim() ?? '';
                        if (v.isEmpty) return 'Phone number is required';
                        if (!RegExp(r'^\d{11}$').hasMatch(v)) {
                          return 'Phone number must be exactly 11 digits';
                        }
                        return null;
                      },
                    ),
                  ] else ...[
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
                  ],
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
                            // Never let the buyer step past the organizer's
                            // remaining stock or total event tickets.
                            onPressed: (_maxQuantity == null || _quantity < _maxQuantity!)
                                ? () => setState(() {
                                    _quantity++;
                                    _clampQuantity();
                                  })
                                : null,
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    () {
                      final cap = _capacityForTier ?? widget.event.ticketCount;
                      final rem = _remainingForTier;
                      if (cap == null) return '';
                      final tierLabel = EventUtils.tierName(_ticketType);
                      if (rem != null) {
                        return 'Ticket capacity: $cap total · $rem left for $tierLabel';
                      }
                      return 'Max $cap tickets for $tierLabel';
                    }(),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textMuted,
                    ),
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
                              widget.giftMode
                                  ? (_total <= 0
                                        ? 'Send Free Ticket'
                                        : 'Pay & Send Ticket')
                                  : (_total <= 0
                                        ? 'Get Free Ticket'
                                        : 'Pay with Paystack'),
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
              final soldOut = _tierSoldOut(tier);
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
                  onTap: soldOut
                      ? null
                      : () => setState(() {
                          _ticketType = tier;
                          _clampQuantity();
                        }),
                  child: Opacity(
                    opacity: soldOut ? 0.45 : 1,
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
                            // The organizer's ticket capacity/limit for this tier,
                            // so buyers see stock before they reach Paystack.
                            if (widget.event.capacityForTier(tier) != null)
                              Text(
                                soldOut
                                    ? 'Sold out'
                                    : '${widget.event.remainingForTier(tier)} of ${widget.event.capacityForTier(tier)} left',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w600,
                                  color: selected
                                      ? Colors.white70
                                      : (soldOut
                                          ? const Color(0xFFDC2626)
                                          : AppTheme.textMuted),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
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
