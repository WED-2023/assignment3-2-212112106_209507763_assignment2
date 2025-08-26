require("dotenv").config();
//#region express configures
var express = require("express");
var path = require("path");
var logger = require("morgan");
const session = require("client-sessions");
const DButils = require("./routes/utils/DButils");
var cors = require('cors')

var app = express();
app.use(logger("dev")); //logger
app.use(express.json()); // parse application/json
app.use(
  session({
    cookieName: "session", // the cookie key name
    //secret: process.env.COOKIE_SECRET, // the encryption key
    secret: "template", // the encryption key
    duration: 24 * 60 * 60 * 1000, // expired after 20 sec
    activeDuration: 1000 * 60 * 5, // if expiresIn < activeDuration,
    cookie: {
      httpOnly: true, //changed to true by abed to prevent acces by JS, and increase security 03072025 fix cookie login mismatch
      ephemeral: true, // when true, cookie will be deleted when browser is closed
      // secure: false,   // ✅ required on HTTPS by abed 03072025 TURNED OFF TO FALSE

       secure: false, //by Abed 25082025 for HTTPS
      // sameSite: "none", //cross-site cookie 
    }
    //the session will be extended by activeDuration milliseconds
  })
);
app.use(express.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(express.static(path.join(__dirname, "public"))); //To serve static files such as images, CSS files, and JavaScript files
//local:
//app.use(express.static(path.join(__dirname, "dist")));
//remote:
app.use(express.static(path.join(__dirname, '../212112106_209507763_assignment3.3/dist')));
app.get(/^\/(?!api).*/, (req, res) =>{
  //remote: 
  res.sendFile(path.join(__dirname, '../212112106_209507763_assignment3.3/dist/index.html'));
  //local:
  //res.sendFile(__dirname+"/index.html");

});


var port = process.env.PORT || "3000"; //local=3000 remote=80
//#endregion
const user = require("./routes/user");
const recipes = require("./routes/recipes");
const auth = require("./routes/auth");

const corsOptions = {
  origin: process.env.VUE_APP_SERVER_DOMAIN || 'http://localhost:3001',
  credentials: true,            // if you need cookies/auth; otherwise omit
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'], // adjust if you send custom headers
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight for all routes


//#region cookie middleware
app.use(function (req, res, next) {
  if (req.session && req.session.username) {
    DButils.execQuery("SELECT username FROM users")
      .then((users) => {
        if (users.find((x) => x.username === req.session.username)) {
          req.username = req.session.username;
        }
        next();
      })
      .catch((error) => next());
  } else {
    next();
  }
});
//#endregion

// ----> For cheking that our server is alive
app.get("/alive", (req, res) => res.send("I'm alive"));

// Routings
app.use("/api/users", user);
app.use("/api/recipes", recipes);
app.use("/api", auth);


module.exports = app; // Export the app for testing purposes

