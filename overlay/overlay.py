#!/usr/bin/env python3
"""Transparent, frameless, always-on-top reminder window (Linux, GTK3 + WebKit2).

Reads {"html", "baseUri", "width", "height", "position"} as JSON on stdin and
prints the button the user clicked ("yes" or "later") on stdout.
"""
import json
import os
import sys

# Wayland doesn't let apps place windows or keep them on top; XWayland does.
os.environ.setdefault('GDK_BACKEND', 'x11')

import gi  # noqa: E402

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gdk, Gtk, WebKit2  # noqa: E402

MARGIN = 24
answered = False


def answer(reply):
    # WebKit can emit the reply and a window-close event for the same click.
    # Only print one result, otherwise the extension can read the later value
    # and make the user answer a second time.
    global answered
    if answered:
        return
    answered = True
    print(reply, flush=True)
    Gtk.main_quit()


def place(win, width, height, position):
    display = Gdk.Display.get_default()
    monitor = display.get_primary_monitor() or display.get_monitor(0)
    area = monitor.get_workarea()
    if position == 'bottom-right':
        x = area.x + area.width - width - MARGIN
    elif position == 'center':
        x = area.x + (area.width - width) // 2
    else:  # bottom-left
        x = area.x + MARGIN
    y = area.y + area.height - height - MARGIN
    if position == 'center':
        y = area.y + (area.height - height) // 2
    win.move(x, y)


def main():
    opts = json.load(sys.stdin)
    width, height = opts.get('width', 440), opts.get('height', 660)

    win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
    win.set_title('Hydration Check')
    win.set_decorated(False)
    win.set_resizable(False)
    win.set_keep_above(True)
    win.set_skip_taskbar_hint(True)
    win.set_skip_pager_hint(True)
    win.set_type_hint(Gdk.WindowTypeHint.UTILITY)
    win.set_default_size(width, height)
    win.set_app_paintable(True)
    visual = win.get_screen().get_rgba_visual()
    if visual:
        win.set_visual(visual)

    manager = WebKit2.UserContentManager()
    manager.register_script_message_handler('reply')
    manager.connect('script-message-received::reply',
                    lambda _m, res: answer(res.get_js_value().to_string()))

    view = WebKit2.WebView.new_with_user_content_manager(manager)
    view.set_background_color(Gdk.RGBA(0, 0, 0, 0))
    view.get_settings().set_allow_file_access_from_file_urls(True)
    view.get_settings().set_enable_webgl(True)
    view.load_html(opts['html'], opts['baseUri'])
    win.add(view)

    win.connect('key-press-event',
                lambda _w, e: e.keyval == Gdk.KEY_Escape and answer('later'))
    win.connect('delete-event', lambda *_: answer('later'))

    place(win, width, height, opts.get('position', 'bottom-left'))
    win.show_all()
    win.present()
    Gtk.main()


if __name__ == '__main__':
    main()
