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

  static void clear() => event = null;

  /// Continues a previously requested checkout, if one is waiting. Returns
  /// true when it navigated, so callers can skip their own default redirect.
  static bool resume(BuildContext context) {
    final pending = event;
    if (pending == null) return false;
    event = null;
    context.push('/checkout', extra: pending);
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
void openCheckoutForEvent(BuildContext context, EventModel event) {
  final auth = context.read<AuthProvider>();

  // Already signed in → straight to the Paystack checkout.
  if (auth.status == AuthStatus.authenticated ||
      auth.status == AuthStatus.profileIncomplete) {
    PendingCheckout.clear();
    context.push('/checkout', extra: event);
    return;
  }

  // Signed out → sign in first, then resume this checkout automatically.
  PendingCheckout.event = event;
  context.go('/login');
}
