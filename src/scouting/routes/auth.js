const { OAuth2Client } = require("google-auth-library");
const config = require("../../lib/config");
const oAuth2Client = new OAuth2Client(config.secrets.GOOGLE_AUTH.CLIENT_ID);
const { Router } = require("express");

let router = Router();

router.get("/verify", async (req, res) => {
  const verification = await verifyUser(req.header("token"));
  if (verification.status) {
    res.json({ ...verification });
  } else {
    res.json({ ...verification });
  }
});

router.get("/isDemo", (req, res) => {
  res.json(config.DEMO);
});

async function verifyUser(token) {
  const ticket = await oAuth2Client
    .verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    })
    .catch((e) => {
      return { status: false };
    });
  return { status: true, user: ticket.getPayload() };
}

module.exports = router;
