gnome.compile_schemas()

install_data(
  'org.gnome.shell.extensions.gtk4-ding.gschema.xml',
  install_dir : schema_dir
)

gnome.post_install(
  glib_compile_schemas: true
)