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
  });

  factory EventModel.fromJson(Map<String, dynamic> json, {String? baseOrigin}) {
    double toDouble(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    String? imagePath = json['image_path']?.toString();
    String? absoluteImage = json['absolute_image_url']?.toString();
    if ((absoluteImage == null || absoluteImage.isEmpty) &&
        imagePath != null &&
        imagePath.isNotEmpty &&
        baseOrigin != null) {
      absoluteImage = '$baseOrigin/${imagePath.replaceFirst(RegExp(r'^/'), '')}';
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
      regularPrice: json['regular_price'] != null ? toDouble(json['regular_price']) : null,
      vipPrice: json['vip_price'] != null ? toDouble(json['vip_price']) : null,
      premiumPrice: json['premium_price'] != null ? toDouble(json['premium_price']) : null,
      ticketTypeMode: json['ticket_type_mode']?.toString() ?? json['ticket_type']?.toString(),
      imagePath: imagePath,
      absoluteImageUrl: absoluteImage,
      organizerName: json['organizer_name']?.toString() ?? json['client_name']?.toString(),
      clientName: json['client_name']?.toString(),
      priorityLabel: json['priority_label']?.toString() ?? json['priority']?.toString(),
      salesCount: int.tryParse(json['sales_count']?.toString() ?? '') ?? 0,
      attendeeCount: int.tryParse(json['attendee_count']?.toString() ?? '') ?? 0,
      viewCount: int.tryParse(json['view_count']?.toString() ?? '') ?? 0,
      isFavorite: (json['is_favorite']?.toString() ?? '0') == '1' ||
          json['is_favorite'] == true ||
          (json['is_favorite'] is int && json['is_favorite'] > 0),
      status: json['status']?.toString() ?? 'published',
      latitude: json['latitude'] != null ? toDouble(json['latitude']) : null,
      longitude: json['longitude'] != null ? toDouble(json['longitude']) : null,
      ticketCount: json['ticket_count'] != null ? int.tryParse(json['ticket_count'].toString()) : null,
      maxCapacity: json['max_capacity'] != null ? int.tryParse(json['max_capacity'].toString()) : null,
    );
  }

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
    );
  }
}
