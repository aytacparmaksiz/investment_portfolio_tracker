import os
import re

files_to_fix = [
    'src/pages/Dashboard.tsx',
    'src/pages/Assets.tsx',
    'src/pages/Analytics.tsx',
    'src/pages/Goals.tsx',
    'src/pages/Login.tsx',
    'src/components/BottomNav.tsx',
    'src/components/ErrorBoundary.tsx'
]

color_map = {
    '#1e1b4b': 'var(--text-primary)',
    '#10b981': 'var(--green)',
    '#ef4444': 'var(--red)',
    '#6b7280': 'var(--text-secondary)',
    '#f87171': 'var(--red)',
    '#6366f1': 'var(--accent)',
    'rgba(239, 68, 68, 0.1)': 'var(--red-dim)'
}

for filepath in files_to_fix:
    if not os.path.exists(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace colors
    for old_color, new_color in color_map.items():
        if filepath.endswith('Analytics.tsx') and old_color in ['#10b981', '#ef4444', '#6b7280']:
            # For Analytics, we don't want to replace chart colors by mistake, wait, the prompt said:
            # "Ama grafik renkleri (COLORS dizileri, pasta grafik renkleri) ve hero gradient'ler hardcoded kalabilir."
            # Only buton ve kart arka plan/kenarlık renkleri should be replaced in Goals and Analytics.
            pass
        
    # We will do color replacements carefully using precise regex or logic.
    
    # Wait, instead of python script, maybe I should just use `replace_file_content` for exactly what I need? 
    # Let me just write the exact string replacements.
    
print("done")
