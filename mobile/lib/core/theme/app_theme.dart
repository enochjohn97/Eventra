import 'package:flutter/material.dart';

/// Shared responsive breakpoints so phones, iPads/tablets and desktops all
/// get an optimal layout from the same code.
class Breakpoints {
  static const double tablet = 600;
  static const double desktop = 1024;
  static const double wideDesktop = 1400;

  /// Event-card grid columns per viewport width.
  static int gridColumns(double width) {
    if (width >= wideDesktop) return 4;
    if (width >= desktop) return 3;
    if (width >= tablet) return 2;
    return 1;
  }

  /// Event-card aspect ratio (width/height) — wider cards on tablets get a
  /// slightly shorter body so images stay balanced.
  static double cardAspectRatio(double width) {
    if (width >= desktop) return 0.84;
    if (width >= tablet) return 0.8;
    return 0.75;
  }

  /// Height one event card needs: a 16:10 image plus the compact text body
  /// (date + price row, optional id/category). The title now sits on the image
  /// scrim, so the body is shorter than it used to be. An explicit extent
  /// (rather than an aspect ratio) is what keeps the cards from showing a tall
  /// empty block under their price row; the text scale is respected so larger
  /// system fonts still fit.
  static double cardExtent({
    required double gridWidth,
    required int columns,
    required double textScale,
  }) {
    // EventCard is a horizontal list card: artwork on the left and the
    // event's real date, venue, category and price on the right.
    return 164 * textScale.clamp(1.0, 1.35);
  }

  /// Max width for single-column lists (tickets) on large screens.
  static double listMaxWidth(double width) =>
      width >= tablet ? 720 : double.infinity;

  /// Max width for forms (checkout, profile) on large screens.
  static double formMaxWidth(double width) =>
      width >= tablet ? 640 : double.infinity;

  /// Max width for the event detail sheet content on large screens.
  static double sheetMaxWidth(double width) =>
      width >= desktop ? 720 : double.infinity;
}

class AppTheme {
  static const Color primary = Color(0xFF072A8E);
  static const Color primaryDark = Color(0xFF000080);
  static const Color accent = Color(0xFF395CAA);
  static const Color textMain = Color(0xFF111827);
  static const Color textMuted = Color(0xFF6B7280);
  static const Color bgPage = Color(0xFFF9F8F5);
  static const Color bgCard = Colors.white;
  static const Color error = Color(0xFFEF4444);
  static const Color success = Color(0xFF1B5E20);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: bgPage,
      colorScheme: const ColorScheme.light(
        primary: primary,
        secondary: accent,
        surface: bgCard,
        error: error,
        onPrimary: Colors.white,
        onSurface: textMain,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgPage,
        foregroundColor: textMain,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: textMain,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: const BorderSide(color: primary),
          foregroundColor: primary,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: bgCard,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFEAEEF2)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: bgPage,
        selectedItemColor: primary,
        unselectedItemColor: textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      // NavigationBar (bottom tabs): the selected pill uses the primary blue
      // background, so its icon and label must render white on top of it.
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: bgPage,
        indicatorColor: primary,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? Colors.white
                : textMuted,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            color: states.contains(WidgetState.selected) ? primary : textMuted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
