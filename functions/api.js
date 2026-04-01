const admin = require("firebase-admin");
const { https } = require("firebase-functions");
const { RouterOsClient } = require("mikro-routeros");

exports.updateRouterConfig = https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { ip, username, password } = data;

    const client = new RouterOsClient({
        host: ip,
        user: username,
        password: password,
    });

    try {
        await client.connect();
        //-a or --add		Adds a new item
        await client.menu("/ip address").add({
            address: "192.168.1.100/24",
            interface: "ether1",
        });
        await client.close();
        return { success: true };
    } catch (error) {
        console.error("Error updating router configuration:", error);
        throw new https.HttpsError("internal", "Error updating router configuration.");
    }
});
