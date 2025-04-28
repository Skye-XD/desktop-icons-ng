schema_dir = join_paths(datadir, 'glib-2.0', 'schemas')

gnome.compile_schemas()

install_data(
  'org.gnome.shell.extensions.gtk4-ding.gschema.xml',
  install_dir : schema_dir
)

gnome.post_install(
  glib_compile_schemas: true
)