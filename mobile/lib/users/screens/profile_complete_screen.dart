import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/brand_logo.dart';
import '../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../utils/checkout_navigation.dart';

class ProfileCompleteScreen extends StatefulWidget {
  const ProfileCompleteScreen({super.key});

  @override
  State<ProfileCompleteScreen> createState() => _ProfileCompleteScreenState();
}

class _ProfileCompleteScreenState extends State<ProfileCompleteScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _initialized = false;
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _dobCtrl;
  late TextEditingController _genderCtrl;
  late TextEditingController _countryCtrl;
  late TextEditingController _stateCtrl;
  late TextEditingController _cityCtrl;
  late TextEditingController _addressCtrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      final user = context.read<AuthProvider>().user;
      _nameCtrl = TextEditingController(text: user?.name ?? '');
      _emailCtrl = TextEditingController(text: user?.email ?? '');
      _phoneCtrl = TextEditingController(text: user?.phone ?? '');
      _dobCtrl = TextEditingController(text: user?.dob ?? '');
      _genderCtrl = TextEditingController(text: user?.gender ?? '');
      _countryCtrl = TextEditingController(text: user?.country ?? '');
      _stateCtrl = TextEditingController(text: user?.state ?? '');
      _cityCtrl = TextEditingController(text: user?.city ?? '');
      _addressCtrl = TextEditingController(text: user?.address ?? '');
      _initialized = true;
    }
  }

  @override
  void dispose() {
    if (_initialized) {
      _nameCtrl.dispose();
      _emailCtrl.dispose();
      _phoneCtrl.dispose();
      _dobCtrl.dispose();
      _genderCtrl.dispose();
      _countryCtrl.dispose();
      _stateCtrl.dispose();
      _cityCtrl.dispose();
      _addressCtrl.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final valid = _formKey.currentState!.validate();
    if (!valid) {
      _toast('Please fix the highlighted fields.', Colors.red);
      return;
    }
    final auth = context.read<AuthProvider>();
    final ok = await auth.updateProfile(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), ''),
      dob: _dobCtrl.text.trim(),
      gender: _genderCtrl.text.trim(),
      country: _countryCtrl.text.trim(),
      state: _stateCtrl.text.trim(),
      city: _cityCtrl.text.trim(),
      address: _addressCtrl.text.trim(),
    );
    if (!mounted) return;
    if (ok) {
      _toast('Profile saved and synced.', AppTheme.success);
      // If they were mid-purchase, drop them back into checkout.
      if (!PendingCheckout.resume(context)) context.go('/home');
    } else {
      _toast(auth.error ?? 'Could not sync your profile.', Colors.red);
    }
  }

  void _toast(String message, Color color) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  InputDecoration _fieldDecoration(
    String label,
    TextEditingController controller,
  ) {
    final color = controller.text.trim().isEmpty
        ? Colors.amber
        : AppTheme.success;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: color, width: 1.5),
    );
    return InputDecoration(
      labelText: label,
      enabledBorder: border,
      focusedBorder: border,
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Colors.red, width: 2),
      ),
    );
  }

  Widget _requiredField(
    String label,
    TextEditingController controller, {
    String? hintText,
    int maxLines = 1,
    bool lettersOnly = false,
    bool dateOnly = false,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      decoration: _fieldDecoration(
        label,
        controller,
      ).copyWith(hintText: hintText),
      autovalidateMode: AutovalidateMode.onUserInteraction,
      onChanged: (_) => setState(() {}),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.isEmpty) return 'Required';
        if (lettersOnly &&
            !RegExp(
              r"^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'. -]*$",
            ).hasMatch(text)) {
          return 'Letters only';
        }
        if (dateOnly &&
            (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) ||
                DateTime.tryParse(text) == null)) {
          return 'Enter a date as YYYY-MM-DD';
        }
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (!_initialized) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandLogo(size: 27, markSize: 23, animateEveryMinute: true),
            SizedBox(width: 8),
            Flexible(
              child: Text(
                'Complete Your Profile',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'We need a few details before you can checkout.',
                    style: TextStyle(height: 1.4),
                  ),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _nameCtrl,
                    decoration: _fieldDecoration('Full Name *', _nameCtrl),
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      final value = v?.trim() ?? '';
                      if (value.isEmpty) return 'Name is required';
                      if (value.length < 2) return 'Enter your full name';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: _fieldDecoration('Email *', _emailCtrl),
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return 'Email is required';
                      }
                      if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(v.trim())) {
                        return 'Enter a valid email';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: _fieldDecoration('Phone *', _phoneCtrl),
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      final value = v?.trim() ?? '';
                      if (value.isEmpty) return 'Phone is required';
                      final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
                      if (digits.length < 10 || digits.length > 11) {
                        return 'Enter a valid phone number';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  _requiredField(
                    'Date of Birth *',
                    _dobCtrl,
                    hintText: 'YYYY-MM-DD',
                    dateOnly: true,
                  ),
                  const SizedBox(height: 16),
                  _requiredField('Gender *', _genderCtrl, lettersOnly: true),
                  const SizedBox(height: 16),
                  _requiredField('Country *', _countryCtrl, lettersOnly: true),
                  const SizedBox(height: 16),
                  _requiredField('State *', _stateCtrl, lettersOnly: true),
                  const SizedBox(height: 16),
                  _requiredField('City *', _cityCtrl, lettersOnly: true),
                  const SizedBox(height: 16),
                  _requiredField('Address *', _addressCtrl, maxLines: 3),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: auth.isLoading ? null : _save,
                      child: auth.isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Save & Continue'),
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
}
