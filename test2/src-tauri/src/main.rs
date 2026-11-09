// Windows: start without a console window behind the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    restaurant_till_lib::run()
}
