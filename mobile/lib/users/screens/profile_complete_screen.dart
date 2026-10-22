import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/brand_logo.dart';
import '../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../utils/checkout_navigation.dart';

const _kStates = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
  'Yobe','Zamfara',
];

const _kCities = <String, List<String>>{
  'Abia': ['Aba','Umuahia','Ohafia','Arochukwu','Bende'],
  'Adamawa': ['Yola','Mubi','Numan','Jimeta','Ganye'],
  'Akwa Ibom': ['Uyo','Eket','Ikot Ekpene','Oron','Abak'],
  'Anambra': ['Awka','Onitsha','Nnewi','Ekwulobia','Aguata'],
  'Bauchi': ['Bauchi','Azare','Misau','Katagum','Ningi'],
  'Bayelsa': ['Yenagoa','Sagbama','Brass','Ogbia','Nembe'],
  'Benue': ['Makurdi','Otukpo','Gboko','Katsina-Ala','Vandeikya'],
  'Borno': ['Maiduguri','Biu','Damboa','Dikwa','Gwoza'],
  'Cross River': ['Calabar','Ikom','Ogoja','Obudu','Mamfe'],
  'Delta': ['Asaba','Warri','Sapele','Agbor','Ughelli'],
  'Ebonyi': ['Abakaliki','Afikpo','Onueke','Ezza','Ishielu'],
  'Edo': ['Benin City','Auchi','Uromi','Ekpoma','Igueben'],
  'Ekiti': ['Ado Ekiti','Ikere','Oye','Ijero','Efon'],
  'Enugu': ['Enugu','Nsukka','Agbani','Oji River','Awgu'],
  'FCT': ['Abuja','Gwagwalada','Kuje','Bwari','Kwali'],
  'Gombe': ['Gombe','Kumo','Billiri','Kaltungo','Deba'],
  'Imo': ['Owerri','Orlu','Okigwe','Oguta','Mbaise'],
  'Jigawa': ['Dutse','Hadejia','Birnin Kudu','Gumel','Kazaure'],
  'Kaduna': ['Kaduna','Zaria','Kafanchan','Soba','Kaura'],
  'Kano': ['Kano','Wudil','Gaya','Bichi','Rano'],
  'Katsina': ['Katsina','Daura','Funtua','Mashi','Dutsin-Ma'],
  'Kebbi': ['Birnin Kebbi','Argungu','Yauri','Zuru','Bagudo'],
  'Kogi': ['Lokoja','Kabba','Okene','Idah','Anyigba'],
  'Kwara': ['Ilorin','Offa','Omu-Aran','Lafiagi','Pategi'],
  'Lagos': ['Lagos Island','Lagos Mainland','Ikeja','Lekki','Badagry','Epe','Ikorodu','Victoria Island','Surulere','Apapa'],
  'Nasarawa': ['Lafia','Keffi','Akwanga','Nasarawa','Doma'],
  'Niger': ['Minna','Bida','Suleja','Kontagora','Lapai'],
  'Ogun': ['Abeokuta','Sagamu','Ijebu Ode','Ota','Ilaro'],
  'Ondo': ['Akure','Ondo','Owo','Ikare','Okitipupa'],
  'Osun': ['Osogbo','Ile-Ife','Ilesha','Ede','Iwo'],
  'Oyo': ['Ibadan','Ogbomosho','Oyo','Iseyin','Saki'],
  'Plateau': ['Jos','Bukuru','Shendam','Pankshin','Langtang'],
  'Rivers': ['Port Harcourt','Bonny','Degema','Omoku','Ahoada'],
  'Sokoto': ['Sokoto','Tambuwal','Isa','Gwadabawa','Illela'],
  'Taraba': ['Jalingo','Wukari','Bali','Gembu','Zing'],
  'Yobe': ['Damaturu','Gashua','Potiskum','Nguru','Geidam'],
  'Zamfara': ['Gusau','Kaura Namoda','Talata Mafara','Anka','Zurmi'],
};

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
  late TextEditingController _addressCtrl;
  late TextEditingController _cityOtherCtrl;

  String? _dobValue;
  String? _gender;
  String? _selectedState;
  String? _selectedCity;
  bool _cityIsOther = false;

  String? _normalizeGender(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final lower = raw.toLowerCase();
    const valid = ['Male', 'Female', 'Other'];
    return valid.firstWhere(
      (v) => v.toLowerCase() == lower,
      orElse: () => raw,
    );
  }

  String get _cityValue {
    if (_cityIsOther) return _cityOtherCtrl.text.trim();
    return _selectedCity ?? '';
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = _dobValue != null ? (DateTime.tryParse(_dobValue!) ?? DateTime(now.year - 18)) : DateTime(now.year - 18);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1920),
      lastDate: DateTime(now.year - 5),
      helpText: 'Select Date of Birth',
    );
    if (picked != null && mounted) {
      setState(() {
        _dobValue = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      final user = context.read<AuthProvider>().user;
      _nameCtrl = TextEditingController(text: user?.name ?? '');
      _emailCtrl = TextEditingController(text: user?.email ?? '');
      _phoneCtrl = TextEditingController(text: user?.phone ?? '');
      _addressCtrl = TextEditingController(text: user?.address ?? '');
      _cityOtherCtrl = TextEditingController();

      _dobValue = (user?.dob?.isNotEmpty == true) ? user!.dob : null;
      _gender = _normalizeGender(user?.gender);
      _selectedState = _kStates.contains(user?.state) ? user?.state : null;
      final city = user?.city ?? '';
      final cities = _selectedState != null ? (_kCities[_selectedState] ?? <String>[]) : <String>[];
      if (city.isNotEmpty && cities.contains(city)) {
        _selectedCity = city;
        _cityIsOther = false;
      } else if (city.isNotEmpty) {
        _selectedCity = null;
        _cityIsOther = true;
        _cityOtherCtrl.text = city;
      } else {
        _selectedCity = null;
        _cityIsOther = false;
      }
      _initialized = true;
    }
  }

  @override
  void dispose() {
    if (_initialized) {
      _nameCtrl.dispose();
      _emailCtrl.dispose();
      _phoneCtrl.dispose();
      _addressCtrl.dispose();
      _cityOtherCtrl.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final valid = _formKey.currentState!.validate();
    if (!valid || _dobValue == null || _gender == null || _selectedState == null || _cityValue.isEmpty) {
      _toast('Please fix the highlighted fields.', Colors.red);
      return;
    }
    final auth = context.read<AuthProvider>();
    final ok = await auth.updateProfile(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.replaceAll(RegExp(r'[^0-9]'), ''),
      dob: _dobValue!,
      gender: _gender!,
      country: 'Nigeria',
      state: _selectedState!,
      city: _cityValue,
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
    String label, {
    bool filled = false,
  }) {
    final color = filled ? AppTheme.success : Colors.amber;
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
    int maxLines = 1,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      decoration: _fieldDecoration(
        label,
        filled: controller.text.trim().isNotEmpty,
      ),
      autovalidateMode: AutovalidateMode.onUserInteraction,
      onChanged: (_) => setState(() {}),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.isEmpty) return 'Required';
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
                    decoration: _fieldDecoration('Full Name *', filled: _nameCtrl.text.trim().isNotEmpty),
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
                    decoration: _fieldDecoration('Email *', filled: _emailCtrl.text.trim().isNotEmpty),
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
                    decoration: _fieldDecoration('Phone *', filled: _phoneCtrl.text.trim().isNotEmpty),
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
                  GestureDetector(
                    onTap: _pickDate,
                    child: AbsorbPointer(
                      child: TextFormField(
                        decoration: _fieldDecoration('Date of Birth *', filled: _dobValue != null).copyWith(
                          hintText: 'Tap to select',
                          suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
                        ),
                        controller: TextEditingController(text: _dobValue ?? ''),
                        validator: (_) => (_dobValue == null || _dobValue!.isEmpty) ? 'Required' : null,
                        autovalidateMode: AutovalidateMode.onUserInteraction,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: ValueKey('gender_$_gender'),
                    initialValue: _gender,
                    decoration: _fieldDecoration('Gender *', filled: _gender != null),
                    items: const [
                      DropdownMenuItem(value: 'Male', child: Text('Male')),
                      DropdownMenuItem(value: 'Female', child: Text('Female')),
                      DropdownMenuItem(value: 'Other', child: Text('Other')),
                    ],
                    onChanged: (v) => setState(() => _gender = v),
                    validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    initialValue: 'Nigeria',
                    readOnly: true,
                    decoration: _fieldDecoration('Country', filled: true).copyWith(
                      suffixIcon: const Icon(Icons.lock_outline, size: 16),
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: ValueKey('state_$_selectedState'),
                    initialValue: _selectedState,
                    decoration: _fieldDecoration('State *', filled: _selectedState != null),
                    items: _kStates.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                    onChanged: (v) => setState(() {
                      _selectedState = v;
                      _selectedCity = null;
                      _cityIsOther = false;
                      _cityOtherCtrl.clear();
                    }),
                    validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: ValueKey('city_${_selectedState}_${_cityIsOther ? "Other" : _selectedCity}'),
                    initialValue: _cityIsOther ? 'Other' : _selectedCity,
                    decoration: _fieldDecoration('City *', filled: _selectedCity != null || _cityIsOther),
                    items: [
                      ...(_selectedState != null ? (_kCities[_selectedState] ?? <String>[]) : <String>[])
                          .map((c) => DropdownMenuItem(value: c, child: Text(c))),
                      const DropdownMenuItem(value: 'Other', child: Text('Other (type below)')),
                    ],
                    onChanged: (v) => setState(() {
                      if (v == 'Other') {
                        _cityIsOther = true;
                        _selectedCity = null;
                      } else {
                        _selectedCity = v;
                        _cityIsOther = false;
                        _cityOtherCtrl.clear();
                      }
                    }),
                    validator: (v) => (v == null && !_cityIsOther) ? 'Required' : null,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                  ),
                  if (_cityIsOther) ...[
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: _cityOtherCtrl,
                      decoration: _fieldDecoration('Your City *', filled: _cityOtherCtrl.text.trim().isNotEmpty),
                      onChanged: (_) => setState(() {}),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your city' : null,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                    ),
                  ],
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
