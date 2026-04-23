import re
c = open('js/scene-app.js', 'r', encoding='utf-8').read()
def rep(m):
    return m.group(0).replace('cook', 'pharmacy').replace('Cook', 'Pharmacy').replace('cooking-', 'pharmacy-')
c = re.sub(r'\(function bindPharmacyStationPanel\(\) \{.*?\n[ \t]*\}\)\(\);', rep, c, flags=re.DOTALL)
open('js/scene-app.js', 'w', encoding='utf-8').write(c)
