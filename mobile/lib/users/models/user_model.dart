class UserModel {
  final int id;
  final String name;
  final String email;
  final String? phone;
  final String? customId;
  final String? profilePic;
  final String role;

  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
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
        'custom_id': customId,
        'profile_pic': profilePic,
        'role': role,
      };

  bool get isProfileComplete =>
      name.trim().isNotEmpty && email.trim().isNotEmpty && (phone?.trim().isNotEmpty ?? false);

  UserModel copyWith({
    String? name,
    String? email,
    String? phone,
    String? profilePic,
  }) {
    return UserModel(
      id: id,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      customId: customId,
      profilePic: profilePic ?? this.profilePic,
      role: role,
    );
  }
}
