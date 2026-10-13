class EventModel {
  final int id;
  final String? customId;
  final String eventName;
  final String? description;
  final String? category;
  final String? eventType;
  final String? eventDate;
  final String? eventTime;
  final String? address;
  final String? location;
  final String? state;
  final double price;
  final double? regularPrice;
  final double? vipPrice;
  final double? premiumPrice;
  final String? ticketTypeMode;
  final bool? isFree;
  final String? imagePath;
  final String? absoluteImageUrl;
  final String? organizerName;
  final String? clientName;
  final String? priorityLabel;
  final int salesCount;
  final int attendeeCount;
  final int viewCount;
  final bool isFavorite;
  final String status;
  final double? latitude;
  final double? longitude;
  final int? ticketCount;
  final int? maxCapacity;
  final bool isSoldOut;

  const EventModel({
    required this.id,
    this.customId,
    required this.eventName,
    this.description,
    this.category,
    this.eventType,
    this.eventDate,
    this.eventTime,
    this.address,
    this.location,
    this.state,
    this.price = 0,
    this.regularPrice,
    this.vipPrice,
    this.premiumPrice,
    this.ticketTypeMode,
    this.isFree,
    this.imagePath,
    this.absoluteImageUrl,
    this.organizerName,
    this.clientName,
    this.priorityLabel,
    this.salesCount = 0,
    this.attendeeCount = 0,
    this.viewCount = 0,
    this.isFavorite = false,
    this.status = 'published',
    this.latitude,
    this.longitude,
    this.ticketCount,
    this.maxCapacity,
    this.isSoldOut = false,
  });

  factory EventModel.fromJson(Map<String, dynamic> json, {String? baseOrigin}) {
    double toDouble(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    bool? toNullableBool(dynamic v) {
      if (v == null) return null;
      if (v is bool) return v;
      if (v is num) return v != 0;
      final value = v.toString().trim().toLowerCase();
      if (value == '1' || value == 'true' || value == 'yes') return true;
      if (value == '0' || value == 'false' || value == 'no') return false;
      return null;
    }

    String? imagePath = json['image_path']?.toString();
    String? absoluteImage = json['absolute_image_url']?.toString();
    // The app switches between the local dev server and the live platform, and
    // cached events keep whatever absolute URL they were built with. Always
    // re-resolve a root-relative path against the origin that is live NOW,
    // otherwise an uploaded banner fetched while on localhost keeps 404-ing
    // after the switch (the grey placeholder instead of the image).
    if (imagePath != null &&
        imagePath.isNotEmpty &&
        !imagePath.startsWith('http') &&
        baseOrigin != null &&
        baseOrigin.isNotEmpty) {
      absoluteImage =
          '$baseOrigin/${imagePath.replaceFirst(RegExp(r'^/'), '')}';
    }

    return EventModel(
      id: int.tryParse(json['id']?.toString() ?? '') ?? 0,
      customId: json['custom_id']?.toString(),
      eventName: json['event_name']?.toString() ?? 'Untitled Event',
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      eventType: json['event_type']?.toString(),
      eventDate: json['event_date']?.toString(),
      eventTime: json['event_time']?.toString(),
      address: json['address']?.toString(),
      location: json['location']?.toString(),
      state: json['state']?.toString(),
      price: toDouble(json['price']),
      regularPrice: toDouble(json['regular_price']),
      vipPrice: toDouble(json['vip_price']),
      premiumPrice: toDouble(json['premium_price']),
      ticketTypeMode:
          json['ticket_type_mode']?.toString() ??
          json['ticket_type']?.toString(),
      isFree: toNullableBool(json['is_free']),
      imagePath: imagePath,
      absoluteImageUrl: absoluteImage,
      organizerName:
          json['organizer_name']?.toString() ?? json['client_name']?.toString(),
      clientName: json['client_name']?.toString(),
      priorityLabel:
          json['priority_label']?.toString() ?? json['priority']?.toString(),
      salesCount: int.tryParse(json['sales_count']?.toString() ?? '') ?? 0,
      attendeeCount:
          int.tryParse(json['attendee_count']?.toString() ?? '') ?? 0,
      viewCount: int.tryParse(json['view_count']?.toString() ?? '') ?? 0,
      isFavorite:
          (json['is_favorite']?.toString() ?? '0') == '1' ||
          json['is_favorite'] == true ||
          (json['is_favorite'] is int && json['is_favorite'] > 0),
      status: json['status']?.toString() ?? 'published',
      latitude: json['latitude'] != null ? toDouble(json['latitude']) : null,
      longitude: json['longitude'] != null ? toDouble(json['longitude']) : null,
      ticketCount: json['ticket_count'] != null
          ? int.tryParse(json['ticket_count'].toString())
          : null,
      maxCapacity: json['max_capacity'] != null
          ? int.tryParse(json['max_capacity'].toString())
          : null,
      isSoldOut:
          json['sold_out'] == true ||
          (json['sold_out'] is int && json['sold_out'] > 0) ||
          json['sold_out']?.toString() == '1',
    );
  }

  /// Serializes for the local events cache. `absolute_image_url` is included
  /// so cached events keep resolvable images even when restored without a
  /// `baseOrigin` (see EventCacheService).
  Map<String, dynamic> toJson() => {
    'id': id,
    'custom_id': customId,
    'event_name': eventName,
    'description': description,
    'category': category,
    'event_type': eventType,
    'event_date': eventDate,
    'event_time': eventTime,
    'address': address,
    'location': location,
    'state': state,
    'price': price,
    'regular_price': regularPrice,
    'vip_price': vipPrice,
    'premium_price': premiumPrice,
    'ticket_type_mode': ticketTypeMode,
    'is_free': isFree,
    'image_path': imagePath,
    'absolute_image_url': absoluteImageUrl,
    'organizer_name': organizerName,
    'client_name': clientName,
    'priority_label': priorityLabel,
    'sales_count': salesCount,
    'attendee_count': attendeeCount,
    'view_count': viewCount,
    'is_favorite': isFavorite ? 1 : 0,
    'status': status,
    'latitude': latitude,
    'longitude': longitude,
    'ticket_count': ticketCount,
    'max_capacity': maxCapacity,
    'sold_out': isSoldOut ? 1 : 0,
  };

  EventModel copyWith({bool? isFavorite}) {
    return EventModel(
      id: id,
      customId: customId,
      eventName: eventName,
      description: description,
      category: category,
      eventType: eventType,
      eventDate: eventDate,
      eventTime: eventTime,
      address: address,
      location: location,
      state: state,
      price: price,
      regularPrice: regularPrice,
      vipPrice: vipPrice,
      premiumPrice: premiumPrice,
      ticketTypeMode: ticketTypeMode,
      isFree: isFree,
      imagePath: imagePath,
      absoluteImageUrl: absoluteImageUrl,
      organizerName: organizerName,
      clientName: clientName,
      priorityLabel: priorityLabel,
      salesCount: salesCount,
      attendeeCount: attendeeCount,
      viewCount: viewCount,
      isFavorite: isFavorite ?? this.isFavorite,
      status: status,
      latitude: latitude,
      longitude: longitude,
      ticketCount: ticketCount,
      maxCapacity: maxCapacity,
      isSoldOut: isSoldOut,
    );
  }
}
