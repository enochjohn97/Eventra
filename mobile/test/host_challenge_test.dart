import 'package:flutter_test/flutter_test.dart';
import 'package:eventra_mobile/core/network/host_challenge.dart';

// Captured verbatim from the live host (openresty AES challenge). The
// expected cookie below was produced independently with
// `openssl enc -d -aes-128-cbc -K <a> -iv <b> -nopad` and accepted by the
// production API (verified: GET /api/config/app returned application/json).
const _challengeHtml =
    '<html><body><script type="text/javascript" src="/aes.js" ></script>'
    '<script>function toNumbers(d){var e=[];d.replace(/(..)/g,function(d){e.push(parseInt(d,16))});return e}'
    'function toHex(){for(var d=[],d=1==arguments.length&&arguments[0].constructor==Array?arguments[0]:arguments,e="",f=0;f<d.length;f++)e+=(16>d[f]?"0":"")+d[f].toString(16);return e.toLowerCase()}'
    'var a=toNumbers("f655ba9d09a112d4968c63579db590b4"),'
    'b=toNumbers("98344c2eee86c3994890592585b49f80"),'
    'c=toNumbers("bdcd5ffef36848d904f8c5a685e39719");'
    'document.cookie="__test="+toHex(slowAES.decrypt(c,2,a,b))'
    '+"; max-age=21600; expires=Thu, 31-Dec-37 23:55:55 GMT; path=/";'
    'location.href="https://eventra-website.liveblog365.com/api/config/app?i=1";'
    '</script><noscript>This site requires Javascript to work, please enable '
    'Javascript in your browser or use a browser with Javascript support'
    '</noscript></body></html>';

void main() {
  group('HostChallenge', () {
    test('detects the anti-bot challenge page', () {
      expect(HostChallenge.isChallenge(_challengeHtml), isTrue);
      expect(HostChallenge.isChallenge('{"success":true}'), isFalse);
      expect(HostChallenge.isChallenge(null), isFalse);
      expect(HostChallenge.isChallenge('<html><body>404</body></html>'), isFalse);
    });

    test('solves the captured challenge to the openssl-verified cookie', () {
      final cookie = HostChallenge.solve(_challengeHtml);
      expect(cookie, '__test=718febf3386ba1cd5f1178e9c49662bc');
    });

    test('returns null for malformed challenge bodies', () {
      expect(HostChallenge.solve('toNumbers("deadbeef") slowAES'), isNull);
      expect(
        HostChallenge.solve(
          'toNumbers("00") toNumbers("11") toNumbers("22") slowAES',
        ),
        isNull,
      );
    });
  });
}
