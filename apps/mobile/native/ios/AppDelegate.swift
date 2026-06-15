//
//  Engine-owned AppDelegate override for the Capacitor shell.
//
//  This is TOOLING, not game content. The generator copies it over the vanilla
//  AppDelegate that `cap add ios` produces inside the disposable per-adventure
//  build dir (<adventure>/.blackbox/build/ios). Re-applied on every sync, so a
//  wiped/regenerated build dir always gets this customization back.
//
import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // The game's audio is WebAudio played inside WKWebView. By default iOS
        // treats it as `.playback` media — it grabs the Now Playing session and
        // shows a "track playing" UI in the Dynamic Island / Control Center.
        // `.ambient` makes it behave like game audio instead: no Now Playing,
        // mixes with other apps, and obeys the hardware mute switch.
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[Blackbox] audio session setup failed: \(error)")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
