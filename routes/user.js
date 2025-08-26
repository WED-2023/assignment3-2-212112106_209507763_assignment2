var express = require("express");
var router = express.Router();
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");



//last clicked 2nd version abed 03072025 below
/**
 * Get the user's 3 last viewed recipes
 */
router.get('/last', async (req, res, next) => {
   console.log("starting /last:");
  try {
    const username = req.session?.username;
    console.log("Username in /last:", username);

    if (!username) {
      return res.status(401).send("User not logged in.");
    }

    // Call the utility function to get last clicked recipes
    const clickedRecipes = await recipe_utils.getLastClickedRecipes(username);
    console.log("Last Clicked recipes retrieved:", clickedRecipes);
    // Return the list of clicked recipes
    res.status(200).json(clickedRecipes);

  } catch (err) {
    console.log("JUMPED TO CATCH IN /last 3.2 :");
    console.error("Error retrieving last viewed recipes:", err.message);
    res.status(500).send("Server error while fetching recipes.");
    next(err); // Pass the error to the next middleware
  }
});


/**
 * Return the users recipes
 */
router.get('/myRecipes', async (req, res, next) => {
  try {
    const results = await recipe_utils.getMyRecipesIDS(req.session.username);
   // res.status(200).send(results);
    console.log("Results from getMyRecipesIDS:", results);
    const recipeIds = results.map(row => row.recipe_id);
    res.status(200).json(recipeIds);
  } catch (error) {
    next(error);
  }
});

// Middleware to check for authenticated user on all routes below
router.use(async function (req, res, next) {
  if (!req.session?.username || req.session.username === "") {
    return res.status(404).send("Unauthorized from 3.2 express server: No session username found.");
  } 
  next(); // If no session or user found, just continue to next middleware
});

//=================== GET ===================

/**
 * Return the users Favorite Recipes
 */
router.get('/favoriteRecipes', async (req, res, next) => {
  try {
    const username = req.session?.username;
    if (!username) return res.status(401).send("User not logged in");

    // Get favorite recipe IDs
    const recipes = await recipe_utils.getFavoriteRecipes(username);

    // Map to plain array of IDs
    const recipeIds = recipes.map(row => row.recipe_id);

    res.status(200).json(recipeIds); // Return as JSON array
  } catch (error) {
    console.error("Error in /favoriteRecipes:", error);
    next(error);
  }
});





/**
 * Get user details by username
 */
router.get("/:username", async (req, res, next) => {
  try {
    const user = await user_utils.getUserDetails(req.params.username);
    if (!user) {
      res.status(404).send({ message: "User not found" });
    } else {
      res.send(user);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Check if a username is already taken
 */
router.get("/exists/:username", async (req, res, next) => {
  try {
    const exists = await user_utils.isUsernameTaken(req.params.username);
    res.send({ exists });
  } catch (error) {
    next(error);
  }
});
//=================== END GET ===================


//=================== POST ===================

/**
 * Mark a recipe as a favorite
 */
router.post("/favoriteRecipes/:recipeId", async (req, res) => {
  const username = req.session?.username;
  const recipeId = req.params.recipeId;
  console.log(`\n[INFO] Incoming favorite mark request for recipe ID: ${recipeId} by user: ${username}`);

  if (!username) {
    console.warn("[WARN] No username in session");
    return res.status(401).send("User not logged in");
  }
  let foundLocally = 0;

  foundLocally = recipe_utils.checkIfRecipeIsLocal(username, recipeId);
  try {

    // 3) If not found locally, check Spoonacular API
    if (foundLocally < 1) {
    
      try {
        console.log("[INFO] Recipe not found locally. Trying Spoonacular API...");
        const apiRes = await recipe_utils.spoonacularGet(`/${recipeId}/information`, {
            includeNutrition: false
          });
          console.log("[SPOONACULAR] API response received");

        if (!apiRes || apiRes.status === 404 || !apiRes.id) {
          console.warn("[SPOONACULAR] Recipe not found or bad response");
          return res.status(404).send("Recipe not found locally or in Spoonacular");
        }
        // recipe found in Spoonacular, proceed
      } catch (err) {
        console.error("[SPOONACULAR] API Error:", err.message);
        return res.status(404).send("Recipe not found locally or in Spoonacular");
      }
    }

    await recipe_utils.addRecipeToFavorites(username, recipeId);
    res.status(200).send("Recipe marked as favorite");

  } catch (err) {
    console.error("Error marking recipe as favorite:", err);
    res.status(500).send("Server error");
  }
});




/**
 * Add last recipe clicked into the database until a max of 3
 */
router.post("/clickOnRecipe", async (req, res, next) => {
  try {
    
    const username = req.session.username;
    const recipeId = req.body.recipeId;
    let foundLocally = 0;

    foundLocally = recipe_utils.checkIfRecipeIsLocal(username, recipeId);

    if (foundLocally < 1) {
      try {

        const apiRes = await recipe_utils.spoonacularGet(`/${recipeId}/information`, {
            includeNutrition: false
          });

        if (!apiRes || apiRes.status === 404) {
          return res.status(404).send("Recipe not found locally or in Spoonacular");
        }
        // recipe found in Spoonacular, proceed
      } catch (err) {
        return res.status(404).send("Recipe not found locally or in Spoonacular");
      }
    }
    if (!username) {
      console.warn("[WARN] Missing username in session");
      return res.status(401).send("Unauthorized: No session username found.");
    }

    if (!recipeId) {
      console.warn("[WARN] No recipeId provided in request body");
      return res.status(400).send("Bad Request: recipeId is required.");
    }
    console.log("[DEBUG] BEFORE SAVE LAST saveLastClick result:");

    const result = await recipe_utils.saveLastClick(username, recipeId);
    console.log(`[DEBUG] saveLastClick result, username: ${username}, recipe_id: ${recipeId}`);
    res.status(200).send({ message: "Recipe click registered." });
    // Fetch recipe preview from DB or Spoonacular here...
  } catch (err) {
        console.error("[ERROR] Exception in /clickOnRecipe:", err);
        res.status(500).send("Server error while fetching recipes.");
  }
});


//=================== END POST ===================



//=================== DELETE ===================


/**
 * Un-mark (remove) a favorite recipe by recipeId
 */
router.delete('/favoriteRecipes/:recipeId', async (req,res,next) => {
  try{
    const username = req.session.username;
    const recipeId = req.params.recipeId;
    await recipe_utils.removeFavoriteRecipe(username,recipeId);
    res.status(200).send("The Recipe successfully removed from favorites");
  } catch(error){
    console.error("Error message:", error.message);
    console.error("Stack trace:", error.stack);
    next(error);
  }
});
//=================== END DELETE ===================

module.exports = router;
