
if prefix.startswith('/usr')
    configure_file(input: 'gtk4-desktop-icons.in',
                   output: 'gtk4-desktop-icons',
                   configuration: {'PREFIX': prefix, 'EXTENSION_ID': extension_id},
                   install: true,
                   install_dir: '/etc/apparmor.d')
endif