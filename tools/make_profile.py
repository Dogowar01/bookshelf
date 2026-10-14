"""Builds bookshelf.mobileconfig: an iPhone/iPad profile that adds the app to the home screen
with the icon embedded in the profile itself, so iOS never has to fetch it from the website.

Run after changing the icon or the site address:  python3 tools/make_profile.py
"""
import pathlib
import plistlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'https://dogowar01.github.io/bookshelf/'
ICON = ROOT / 'icons' / 'apple-touch-icon.png'
OUT = ROOT / 'bookshelf.mobileconfig'

# Fixed UUIDs (derived from the URL) so reinstalling replaces the old shortcut instead of adding another.
ns = uuid.uuid5(uuid.NAMESPACE_URL, URL)
profile = {
    'PayloadType': 'Configuration',
    'PayloadVersion': 1,
    'PayloadIdentifier': 'io.github.dogowar01.bookshelf',
    'PayloadUUID': str(uuid.uuid5(ns, 'profile')).upper(),
    'PayloadDisplayName': 'My Bookshelf',
    'PayloadDescription': 'Adds the My Bookshelf app to your home screen with its bookcase icon. It adds one home-screen shortcut and changes nothing else.',
    'PayloadOrganization': 'My Bookshelf',
    'PayloadContent': [{
        'PayloadType': 'com.apple.webClip.managed',
        'PayloadVersion': 1,
        'PayloadIdentifier': 'io.github.dogowar01.bookshelf.webclip',
        'PayloadUUID': str(uuid.uuid5(ns, 'webclip')).upper(),
        'PayloadDisplayName': 'Bookshelf',
        'Label': 'Bookshelf',
        'URL': URL,
        'Icon': ICON.read_bytes(),
        'FullScreen': True,
        'Precomposed': True,
        'IsRemovable': True,
    }],
}
OUT.write_bytes(plistlib.dumps(profile))
print(f'wrote {OUT.name} ({OUT.stat().st_size} bytes) for {URL}')
