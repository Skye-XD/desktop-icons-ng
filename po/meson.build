system_localedir = join_paths(datadir, 'locale')
user_localedir = join_paths(extensions_dir, 'locale')

localedir = prefix.startswith('/usr') ? system_localedir : user_localedir

proj_root = meson.project_source_root()
po_autofill_script = proj_root / 'scripts' / 'po-autofill.mjs'

msgcat = find_program('msgcat', required: true)
xgettext = find_program('xgettext', required: true)
node   = find_program('node', required: false)

i18n.gettext (
    meson.project_name (),
    preset: 'glib',
    install_dir: localedir
)

if node.found()
    lt_env = environment()
    lt_env.set('LT_URL', 'http://localhost:5000')
    lt_env.set('LT_SOURCE', 'en')
    lt_env.set('LT_API_KEY', '')

    # Run LibreTranslate auto-fill over all languages from LINGUAS ---
    po_autofill = run_target('po-autofill',
      command: [ node, po_autofill_script ],
      env: lt_env
    )
endif