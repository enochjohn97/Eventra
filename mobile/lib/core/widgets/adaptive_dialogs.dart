import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

Future<void> showAdaptiveMessage(
  BuildContext context, {
  required String message,
  String? title,
}) async {
  if (Platform.isIOS) {
    await showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: title != null ? Text(title) : null,
        content: Text(message),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  } else {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

Future<bool?> showAdaptiveConfirm(
  BuildContext context, {
  required String title,
  required String message,
  String confirm = 'Confirm',
  String cancel = 'Cancel',
  bool isDestructive = false,
}) {
  if (Platform.isIOS) {
    return showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: Text(cancel)),
          CupertinoDialogAction(
            isDestructiveAction: isDestructive,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirm),
          ),
        ],
      ),
    );
  }
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(cancel)),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirm, style: TextStyle(color: isDestructive ? Colors.red : null)),
        ),
      ],
    ),
  );
}
