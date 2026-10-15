import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart' show AppTheme, Breakpoints;
import '../models/user_model.dart';
import '../../core/widgets/adaptive_dialogs.dart';
import '../../core/widgets/brand_logo.dart';
import '../providers/auth_provider.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _dobCtrl;
  late TextEditingController _genderCtrl;
  late TextEditingController _countryCtrl;
  late TextEditingController _stateCtrl;
  late TextEditingController _cityCtrl;
  late TextEditingController _addressCtrl;
  bool _initialized = false;

  /// false = read-only profile summary (avatar, name, email, Edit Profile,
  /// Log Out) — the state shown after a successful save. true = edit form.
  bool _editing = false;

  void _syncControllers(UserModel? user) {
    _nameCtrl.text = user?.name ?? '';
    _emailCtrl.text = user?.email ?? '';
    _phoneCtrl.text = user?.phone ?? '';
    _dobCtrl.text = user?.dob ?? '';
    _genderCtrl.text = user?.gender ?? '';
    _countryCtrl.text = user?.country ?? '';
    _stateCtrl.text = user?.state ?? '';
    _cityCtrl.text = user?.city ?? '';
    _addressCtrl.text = user?.address ?? '';
  }

  @override
  void initState() {
    super.initState();
    // Pull the latest profile from the server so profile changes made on the
    // website appear here automatically, without restarting the app.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final auth = context.read<AuthProvider>();
      await auth.refreshProfile();
      if (!mounted) return;
      setState(() => _syncControllers(auth.user));
    });
  }

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
      // Start in edit mode only when required details are still missing.
      _editing = !(user?.isProfileComplete ?? false);
      _initialized = true;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _dobCtrl.dispose();
    _genderCtrl.dispose();
    _countryCtrl.dispose();
    _stateCtrl.dispose();
    _cityCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      _toast('Please fix the highlighted fields.', Colors.red);
      return;
    }
    final auth = context.read<AuthProvider>();
    final ok = await auth.updateProfile(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      dob: _dobCtrl.text.trim(),
      gender: _genderCtrl.text.trim(),
      country: _countryCtrl.text.trim(),
      state: _stateCtrl.text.trim(),
      city: _cityCtrl.text.trim(),
      address: _addressCtrl.text.trim(),
    );
    if (!mounted) return;
    if (ok) {
      _syncControllers(auth.user);
      setState(() => _editing = false);
      _toast('Profile updated and synced.', AppTheme.success);
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

  Future<void> _logout() async {
    final confirmed = await showAdaptiveConfirm(
      context,
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirm: 'Log out',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    await context.read<AuthProvider>().logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

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
          constraints: BoxConstraints(
            maxWidth: Breakpoints.formMaxWidth(
              MediaQuery.sizeOf(context).width,
            ),
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: !_editing
                ? _buildSummary(context, auth, user)
                : _buildForm(auth, user),
          ),
        ),
      ),
    );
  }

  /// Read-only profile view shown after a successful save: avatar, name,
  /// email, and the two actions from the design — Edit Profile + Log Out.
  Widget _buildSummary(
    BuildContext context,
    AuthProvider auth,
    UserModel? user,
  ) {
    return Column(
      children: [
        CircleAvatar(
          radius: 56,
          backgroundImage: _profileImage(user?.profilePic),
          child: user?.profilePic == null
              ? const Icon(Icons.person, size: 48)
              : null,
        ),
        const SizedBox(height: 16),
        Text(
          user?.name ?? '',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Text(
          user?.email ?? '',
          style: const TextStyle(color: AppTheme.textMuted),
          textAlign: TextAlign.center,
        ),
        if ([
          user?.city,
          user?.state,
        ].whereType<String>().any((v) => v.isNotEmpty)) ...[
          const SizedBox(height: 4),
          Text(
            [
              user?.city,
              user?.state,
            ].whereType<String>().where((v) => v.isNotEmpty).join(', '),
            style: const TextStyle(color: AppTheme.textMuted),
            textAlign: TextAlign.center,
          ),
        ],
        if (user?.customId != null) ...[
          const SizedBox(height: 6),
          Text(user!.customId!, style: const TextStyle(color: Colors.grey)),
        ],
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.success,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              _syncControllers(auth.user);
              setState(() => _editing = true);
            },
            child: const Text('Edit Profile'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: auth.isLoading ? null : _logout,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
            ),
            child: const Text('Log Out'),
          ),
        ),
      ],
    );
  }

  Widget _buildForm(AuthProvider auth, UserModel? user) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          CircleAvatar(
            radius: 44,
            backgroundImage: _profileImage(user?.profilePic),
            child: user?.profilePic == null
                ? const Icon(Icons.person, size: 40)
                : null,
          ),
          if (user?.customId != null) ...[
            const SizedBox(height: 8),
            Text(user!.customId!, style: const TextStyle(color: Colors.grey)),
          ],
          const SizedBox(height: 24),
          TextFormField(
            controller: _nameCtrl,
            decoration: _fieldDecoration('Full Name *', _nameCtrl),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[A-Za-zÀ-ÖØ-öø-ÿ ]')),
            ],
            autovalidateMode: AutovalidateMode.onUserInteraction,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final value = v?.trim() ?? '';
              if (value.isEmpty) return 'Required';
              if (!RegExp(
                r"^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: +[A-Za-zÀ-ÖØ-öø-ÿ]+)*$",
              ).hasMatch(value)) {
                return 'Use letters and spaces only';
              }
              if (value.split(RegExp(r'\s+')).length < 2) {
                return 'Enter your first and last name';
              }
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
              if (v == null || v.trim().isEmpty) return 'Required';
              if (!_isValidEmail(v.trim())) {
                return 'Enter a valid email address';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(11),
            ],
            decoration: _fieldDecoration('Phone *', _phoneCtrl),
            autovalidateMode: AutovalidateMode.onUserInteraction,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final value = v?.trim() ?? '';
              if (value.isEmpty) return 'Required';
              if (!RegExp(r'^\d+$').hasMatch(value)) return 'Digits only';
              if (value.length != 11) return 'Enter exactly 11 digits';
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
          const SizedBox(height: 28),
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
                  : const Text('Save Changes'),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: auth.isLoading
                  ? null
                  : () => setState(() => _editing = false),
              child: const Text('Cancel'),
            ),
          ),
        ],
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
      keyboardType: dateOnly ? TextInputType.datetime : TextInputType.text,
      inputFormatters: dateOnly
          ? [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9-]')),
              LengthLimitingTextInputFormatter(10),
            ]
          : lettersOnly
          ? [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-zÀ-ÖØ-öø-ÿ ]'))]
          : null,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      onChanged: (_) => setState(() {}),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.isEmpty) return 'Required';
        if (lettersOnly &&
            !RegExp(
              r"^[A-Za-zÀ-ÖØ-öø-ÿ]+(?: +[A-Za-zÀ-ÖØ-öø-ÿ]+)*$",
            ).hasMatch(text)) {
          return 'Use letters and spaces only';
        }
        if (dateOnly && !_isValidDate(text)) {
          return 'Enter a date as YYYY-MM-DD';
        }
        return null;
      },
    );
  }

  bool _isValidEmail(String value) => RegExp(
    r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$",
    caseSensitive: false,
  ).hasMatch(value);

  bool _isValidDate(String value) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
    if (match == null) return false;
    final year = int.parse(match.group(1)!);
    final month = int.parse(match.group(2)!);
    final day = int.parse(match.group(3)!);
    final date = DateTime.tryParse(value);
    return date != null &&
        date.year == year &&
        date.month == month &&
        date.day == day;
  }
}

ImageProvider? _profileImage(String? pic) {
  if (pic == null || pic.isEmpty) return null;
  final url = pic.startsWith('http') ? pic : ApiClient().absoluteUrl(pic);
  return url.isEmpty ? null : NetworkImage(url);
}
