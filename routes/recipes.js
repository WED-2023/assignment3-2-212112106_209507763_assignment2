var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
const { addMyRecipe } = require("./utils/recipes_utils");
const recipe_utils = require("./utils/recipes_utils");
require('dotenv').config({ path: '../.env' });

//=================== GET ===================

// Random Get 3 Recipes
router.get("/random", async (req, res, next) => {
  try {
    const data = await recipes_utils.spoonacularGet("/random", { number: 3 });
    console.log("Raw data from Spoonacular:", JSON.stringify(data.recipes, null, 2));
    const previews = data.recipes.map(recipe =>
        recipes_utils.extractRecipePreview(recipe)
        
    );
  console.log("Preview recipes returned to frontend:", previews); 
    res.status(200).json(previews);
  } catch (err) {
    res.status(500).send("Server error while fetching recipes.");
  }
});

router.get("/familyRecipes", async (req, res, next) => {
  try{
    console.log(" *******************inside /familyRecipes");
    const familyRecipes = await recipe_utils.getFamilyRecipes();

    const recipeIds = familyRecipes.map(row => row.recipe_id);
    res.status(200).json(recipeIds);
  } catch(error){
    next(error);
  }
});


//V3 BY ABED, RETURN IDS ONLY FOR GENERIC FETCH RECIPES
router.get("/search", async (req, res, next) => {
  try {
    let { query, cuisine, diet, intolerances, number } = req.query;

    // If no query provided, check session cache
    if (!query) {
      if (req.session.lastSearch) {
        ({ query, cuisine, diet, intolerances, number } = req.session.lastSearch);
      } else {
        return res.status(200).json([]);
      }
    }

    // Store current query in session
    req.session.lastSearch = { query, cuisine, diet, intolerances, number };

    // 1. Call Spoonacular /complexSearch
    const searchParams = { query, cuisine, diet, intolerances, number };
    const response = await recipes_utils.spoonacularGet("/complexSearch", searchParams);
    console.log("Spoonacular search response 3.2:", response);
    // 2. Extract recipe IDs
    const results = response.results || [];
    const recipeIds = results.map(r => r.id);
    console.log("Extracted recipe IDs:", recipeIds);
    if (!recipeIds.length) {
      return res.status(200).json([]);
    }

    return res.status(200).json(recipeIds);

  } catch (error) {
    console.error("Spoonacular search failed:", error.message);
    const status = error.response?.status || 500;
    res.status(status).send({ message: "Search failed", detail: error.message });
  }
});


//Search API by ID, first search in database if not exist search in API
// In your Express router file:
router.get("/:recipeId", async (req, res) => {
  const { recipeId } = req.params;
  const username = req.session?.username;

  try {
    // Try local DB first
    const rows = await recipes_utils.getLocalRecipe(username, recipeId);

    let recipeData;
    if (rows.length > 0) {
      // Found in local DB. Adjust column names if different in your schema.
      const row = rows[0];

      recipeData = {
        recipe_image: row.recipe_image,
        recipe_title: row.recipe_title,
        prep_duration: row.prep_duration, // e.g. "00:45:00"
        popularity: row.popularity,
        vegetarian: Boolean(row.vegetarian),
        vegan: Boolean(row.vegan),
        gluten_free: Boolean(row.gluten_free),
        ingredients: row.extendedIngredients,                 // array of { name, amount }
        instructions: row.instructions || "", // text
        amount_of_meals: row.amount_of_meals,
        id: String(recipeId),
        ...(recipeId < 0 && {
          recipe_author: row.recipe_author,
          recipe_season: row.recipe_season
        })
      };
    } else {
      // Not in DB: fetch from Spoonacular
      console.log(`Recipe ${recipeId} not found locally. Fetching from Spoonacular.`);
      let data;
      try {
        data = await recipes_utils.spoonacularGet(`/${recipeId}/information`, {
          includeNutrition: false
        });
      } catch (err) {
        console.error(`Spoonacular fetch error for ${recipeId}:`, err.message);
        return res.status(404).send({ message: "Recipe not found locally or in Spoonacular" });
      }
      if (!data || !data.id) {
        return res.status(404).send({ message: "Recipe not found locally or in Spoonacular" });
      }
      // Build fields:
      // Convert readyInMinutes to "HH:MM:SS"
      const minutes = data.readyInMinutes || 0;
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const pad = (n) => String(n).padStart(2, '0');
      const prep_duration = `${pad(hrs)}:${pad(mins)}:00`;

      // Ingredients array
      const ingredients = Array.isArray(data.extendedIngredients)
        ? data.extendedIngredients.map(i => {
            // e.g. { name: "Sugar", amount: "2 cups" }
            const unit = i.unit || "";
            const amt = i.amount != null ? `${i.amount} ${unit}`.trim() : "";
            return { name: i.name || i.originalName || "", amount: amt };
          })
        : [];

      // Instructions: flatten analyzedInstructions if present
      let instructions = "";
      if (Array.isArray(data.analyzedInstructions) && data.analyzedInstructions.length) {
        data.analyzedInstructions.forEach(block => {
          if (Array.isArray(block.steps)) {
            block.steps.forEach(step => {
              if (step.number != null && step.step) {
                instructions += `${step.number}. ${step.step}\n`;
              }
            });
          }
        });
      } else if (data.instructions) {
        // data.instructions may be HTML; strip tags naively:
        const text = data.instructions.replace(/<[^>]+>/g, '');
        instructions = text + "\n";
      }
      recipeData = {
        recipe_image: data.image || "",
        recipe_title: data.title || "",
        prep_duration,
        popularity: data.aggregateLikes || 0,
        vegetarian: Boolean(data.vegetarian),
        vegan: Boolean(data.vegan),
        gluten_free: Boolean(data.glutenFree),
        ingredients,
        instructions,
        amount_of_meals: data.servings || null,
        id: String(recipeId),
      };

    }

    // Now add user-specific flags:
    // clicked_by_user
    let clicked_by_user = false;
    if (username) {
      try {
        const clickRows = await recipes_utils.getLastClickedRecipes(username);
        if (clickRows.length > 0) {
          // Compare as strings or numbers
          const ids = clickRows.map(x => String(x));
          if (ids.includes(String(recipeId))) {
            clicked_by_user = true;
          }
        }
      } catch (err) {
        console.error("Error checking lastClicks:", err);
      }
    }
    recipeData.clicked_by_user = clicked_by_user;

    // saved_by_user
    let saved_by_user = false;
    if (username) {
      try {
        const favRows = await recipes_utils.getRecipeFromFavorites(username, recipeId);
        if (favRows.length > 0) {
          saved_by_user = true;
        }
      } catch (err) {
        console.error("Error checking favorite_recipes:", err);
      }
    }
    recipeData.saved_by_user = saved_by_user;

    return res.status(200).json(recipeData);
  } catch (err) {
    console.error(`Error fetching recipe ${recipeId}:`, err);
    return res.status(500).send({ message: "Server error fetching recipe details" });
  }
});

//=================== END GET ===================


//=================== POST ===================

// Create a new recipe
// This endpoint is for user-created recipes, not Spoonacular
router.post("/create", async (req, res, next) => {
  try {
    const username = req.session?.username;
    console.log("Session username:", username);
    console.log("Session username:", username);
    if (!username) {
      return res.status(401).send({ message: "Unauthorized. Please log in." });
    }

    const {
      recipe_title,
      recipe_image,
      prep_duration,
      vegetarian,
      vegan,
      gluten_free,
      amount_of_meals,
      instructions,
      extendedIngredients
    } = req.body;
    console.log("Received recipe body:", {
      recipe_title,
      recipe_image,
      prep_duration,
      vegetarian,
      vegan,
      gluten_free,
      amount_of_meals,
      instructions,
      extendedIngredients
    });

    // Basic validation
    if (
        !recipe_title || !prep_duration || !instructions ||
        !Array.isArray(extendedIngredients) || extendedIngredients.length === 0 ||
        typeof vegetarian !== "boolean" || typeof vegan !== "boolean" || typeof gluten_free !== "boolean" ||
        typeof amount_of_meals !== "number"
    ) {
      return res.status(400).send({ message: "Invalid or missing fields in request" });
    }
   console.log("Validation passed. Inserting into DB...");

    // Insert into DB
    await addMyRecipe(username, {
      recipe_title,
      recipe_image,
      prep_duration,
      vegetarian,
      vegan,
      gluten_free,
      amount_of_meals,
      instructions,
      extendedIngredients
    });
    
    console.log("Recipe inserted successfully.");
    res.status(201).send({ message: "Recipe successfully created" });

  } catch (err) {
    console.error("Failed to create recipe:", err.message);
    next(err);
  }
});
//=================== END POST ===================



//=================== DELETE ===================


router.delete("/:recipeId", async (req, res, next) => {
  try {
    if (!req.session?.username) {
      return res.status(401).send("Unauthorized");
    }

    const recipeId = parseInt(req.params.id);
    if (isNaN(recipeId)) {
      return res.status(400).send("Invalid recipe ID");
    }

    const success = await recipes_utils.deleteMyRecipe(req.session.username, recipeId);
    if (success) {
      res.status(200).send({ message: "Recipe deleted" });
    } else {
      res.status(404).send({ message: "Recipe not found or unauthorized" });
    }

  } catch (err) {
    next(err);
  }
});

//=================== END DELETE ===================



module.exports = router;
