// Volt only schedules local notifications (rest timer, workout reminders), so it never needs
// remote push. expo-notifications adds the aps-environment entitlement anyway, and personal
// Apple development teams can't sign apps that have it. Listed before "expo-notifications" in app.json: mods run in reverse, so this one runs last.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
