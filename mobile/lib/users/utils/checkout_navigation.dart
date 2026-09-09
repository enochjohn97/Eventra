import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../models/event_model.dart';
import '../providers/auth_provider.dart';

void openCheckoutForEvent(BuildContext context, EventModel event) {
  final auth = context.read<AuthProvider>();
  if (auth.status != AuthStatus.authenticated) {
    context.go('/login');
    return;
  }
  if (auth.status == AuthStatus.profileIncomplete || auth.user?.isProfileComplete != true) {
    context.go('/profile-complete');
    return;
  }
  context.push('/checkout', extra: event);
}
