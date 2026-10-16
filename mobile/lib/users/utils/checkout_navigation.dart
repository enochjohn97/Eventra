import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../models/event_model.dart';
import '../providers/auth_provider.dart';

/// Remembers the event a shopper tapped "Get Ticket" on while they sign in, so
/// checkout resumes automatically afterwards instead of dumping them on the
/// home screen and making them hunt for the event again.
class PendingCheckout {
  static EventModel? event;

  /// True when the remembered intent was "Get for someone else".
  static bool gift = false;

  static void clear() {
    event = null;
    gift = false;
  }

  /// Continues a previously requested checkout, if one is waiting. Returns
  /// true when it navigated, so callers can skip their own default redirect.
  static bool resume(BuildContext context) {
    final pending = event;
    if (pending == null) return false;
    final wasGift = gift;
    clear();
    context.push('/checkout', extra: checkoutRouteExtra(pending, gift: wasGift));
    return true;
  }
}

/// Sends the shopper to the Paystack checkout for [event].
///
/// The backend's initialize endpoint needs an authenticated account, so a
/// signed-out tap must pass through sign-in — but the intent is remembered and
/// resumed, so the user always ends up on the checkout page (never stranded on
/// login or the profile form). Profile fields (name/phone/…) are collected on
/// the checkout form itself, so an incomplete profile must not block checkout.
/// Extra payload for the `/checkout` route. A gift keeps its flag so the
/// checkout screen knows to ask only for the recipient's email.
Map<String, dynamic> checkoutRouteExtra(EventModel event, {bool gift = false}) =>
    {'event': event, 'gift': gift};

void openCheckoutForEvent(
  BuildContext context,
  EventModel event, {
  bool gift = false,
}) {
  final auth = context.read<AuthProvider>();

  // Already signed in → straight to the Paystack checkout.
  if (auth.status == AuthStatus.authenticated ||
      auth.status == AuthStatus.profileIncomplete) {
    PendingCheckout.clear();
    context.push('/checkout', extra: checkoutRouteExtra(event, gift: gift));
    return;
  }

  // Signed out → sign in first, then resume this checkout automatically.
  PendingCheckout.event = event;
  PendingCheckout.gift = gift;
  context.go('/login');
}
