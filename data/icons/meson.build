icons_dir = join_paths(datadir, 'icons', 'hicolor', 'scalable', 'apps')

install_data([
	'com.desktop.ding.svg',
],
install_dir: icons_dir
)

gnome.post_install(
  gtk_update_icon_cache: true,
)