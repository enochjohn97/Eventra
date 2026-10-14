class UserModel {
  final int id;
  final String name;
  final String email;
  final String? phone;
  final String? dob;
  final String? gender;
  final String? country;
  final String? state;
  final String? city;
  final String? address;
  final String? customId;
  final String? profilePic;
  final String role;

  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.dob,
    this.gender,
    this.country,
    this.state,
    this.city,
    this.address,
    this.customId,
    this.profilePic,
    this.role = 'user',
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: int.tryParse(json['id']?.toString() ?? '') ?? 0,
      name: json['name']?.toString() ?? 'User',
      email: json['email']?.toString() ?? '',
      phone: json['phone']?.toString(),
      dob: json['dob']?.toString(),
      gender: json['gender']?.toString(),
      country: json['country']?.toString(),
      state: json['state']?.toString(),
      city: json['city']?.toString(),
      address: json['address']?.toString(),
      customId: json['custom_id']?.toString(),
      profilePic: json['profile_pic']?.toString() ?? json['profile_image']?.toString(),
      role: json['role']?.toString() ?? 'user',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'dob': dob,
        'gender': gender,
        'country': country,
        'state': state,
        'city': city,
        'address': address,
        'custom_id': customId,
        'profile_pic': profilePic,
        'role': role,
      };

  bool get isProfileComplete =>
      name.trim().isNotEmpty &&
      email.trim().isNotEmpty &&
      (phone?.trim().isNotEmpty ?? false) &&
      (dob?.trim().isNotEmpty ?? false) &&
      (gender?.trim().isNotEmpty ?? false) &&
      (country?.trim().isNotEmpty ?? false) &&
      (state?.trim().isNotEmpty ?? false) &&
      (city?.trim().isNotEmpty ?? false) &&
      (address?.trim().isNotEmpty ?? false);

  UserModel copyWith({
    String? name,
    String? email,
    String? phone,
    String? profilePic,
    String? dob,
    String? gender,
    String? country,
    String? state,
    String? city,
    String? address,
  }) {
    return UserModel(
      id: id,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      dob: dob ?? this.dob,
      gender: gender ?? this.gender,
      country: country ?? this.country,
      state: state ?? this.state,
      city: city ?? this.city,
      address: address ?? this.address,
      customId: customId,
      profilePic: profilePic ?? this.profilePic,
      role: role,
    );
  }
}