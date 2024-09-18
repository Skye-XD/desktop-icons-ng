prefix = get_option('prefix')

if prefix.startswith('/usr')
    conf_data = configuration_data()
    conf_data.set('PREFIX', prefix)
    apparmor_file = configure_file(input: 'gtk4-desktop-icons.in',
                                   output: 'gtk4-desktop-icons',
                                   configuration: conf_data)
    install_data(apparmor_file, install_dir: '/etc/apparmor.d')
endif