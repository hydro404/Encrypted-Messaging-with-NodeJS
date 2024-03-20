const WebSocket = require("ws");
const fs = require("fs");
const readline = require("readline");
const { stdin, stdout } = process;

const crypto = require("crypto");


const ws = new WebSocket("ws://localhost:8080");
let loggedIn = false; // Flag to track if the user is logged in

const clearLastLine = () => {
  process.stdout.moveCursor(0, -1); // Move cursor up one line
  process.stdout.clearLine(1); // Clear from cursor to end
};

let prime, generator; // Declaring global variables

fs.readFile("pub.txt", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }
  const lines = data.split("\n");
  prime = parseInt(lines[0].trim()); // Assigning value to global prime variable
  generator = parseInt(lines[1].trim()); // Assigning value to global generator variable
  // console.log("Prime:", prime);
  // console.log("Generator:", generator);
});

let sharedKeySender;

function hashPassword(password) {
  const hash = crypto.createHash("sha256");
  hash.update(password);
  return hash.digest("hex");
}

function xorCipher(input, key) {
  let ciphertext = "";
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    ciphertext += String.fromCharCode(charCode);
  }
  return ciphertext;
}

function getInput(prompt) {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    return new Promise((resolve, reject) => {
      rl.question(prompt, (input) => {
        rl.close();
        resolve(input.trim());
      });
    });
}

function readUsers() {
    return new Promise((resolve, reject) => {
      fs.readFile("users.json", "utf8", (err, data) => {
        if (err) {
          console.error("Error reading users.json:", err);
          reject(err);
          return;
        }
        try {
          const users = JSON.parse(data);
          resolve(users);
        } catch (parseError) {
          console.error("Error parsing users.json:", parseError);
          reject(parseError);
        }
      });
    });
}

async function findUserByUsername(username) {
    try {
      const users = await readUsers();
      const userId = Object.keys(users).find(
        (id) => users[id].username === username
      );
      return userId ? users[userId] : null;
    } catch (error) {
      throw new Error("Error finding user:", error);
    }
}


async function registerUser(username, password) {
    try {
      let users = await readUsers();
      let id = 1; // Default ID value if users.json is empty
  
      // Check if users object is empty
      if (Object.keys(users).length !== 0) {
        // Find the latest ID
        const ids = Object.keys(users).map(Number);
        id = Math.max(...ids) + 1;
      }
  
      // Check if the username already exists
      if (Object.values(users).some((user) => user.username === username)) {
        console.log("Username already exists");
        return;
      }
  
      // Check for blank username or password
      if (username === "" || password === "") {
        console.log("Username and password cannot be blank");
        return;
      }
      const privateKey = username
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const publicKey = BigInt(generator) ** BigInt(privateKey) % BigInt(prime);
      users[id] = {
        username: username,
        password: hashPassword(password),
        public_key: publicKey.toString(),
      };
  
      // Write updated users object back to users.json
      fs.writeFile("users.json", JSON.stringify(users, null, 4), (err) => {
        if (err) {
          console.error("Error writing to users.json:", err);
        }
        // else {
        //     console.log('User registered successfully! \n You can now login.');
        // }
      });
    } catch (error) {
      console.error("Error registering user:", error);
    }
}

function calculateSharedKey(privateKey, otherPublicKey, prime) {
    return BigInt(otherPublicKey) ** BigInt(privateKey) % BigInt(prime);
}

async function login() {
  let username = await getInput("Enter your username: ");
  let password = await getInput("Enter your password: ");
  while (true) {
    try {
      const users = await readUsers();
      const userId = Object.keys(users).find(
        (id) =>
          users[id].username === username &&
          users[id].password === hashPassword(password)
      );
      if (userId) {
        console.clear();
        console.log("Login successful");
        console.log("What do you want to do?");
        console.log("1. Send a message\n2. Logout");
        const choice = await getInput("Choose an option: ");

        if (choice === "1") {
          let receiver = null;
          while (!receiver) {
            const receiverUsername = await getInput(
              "Enter the recipient's username: "
            );
            receiver = await findUserByUsername(receiverUsername);
            if (!receiver || username === receiver.username) {
              console.log(
                "Recipient not found or cannot be yourself. Please try again."
              );
            } else {
              //console.log(`Receiver found with username: ${receiver.username}`);
              console.log('You may now send your messages to ' + receiver.username);
              console.log('Ctrl+C to exit');
              console.log('\n\n');
              const senderPrivateKey = username
                .split("")
                .reduce((sum, char) => sum + char.charCodeAt(0), 0);
              sharedKeySender = calculateSharedKey(
                parseInt(senderPrivateKey),
                parseInt(receiver.public_key),
                parseInt(prime)
              );
              ws.send(
                JSON.stringify({
                  type: "login",
                  username: username,
                  sharedKey: sharedKeySender.toString(),
                })
              );
              askForInput(username, sharedKeySender.toString());
            }
          }
        } else if (choice === "2") {
          console.log("Logging out...");
          return false; // Return false to indicate logout
        } else {
          console.log("Invalid choice. Please choose again.");
        }
        return true; // Return true to indicate successful login
      } else {
        console.log("Login failed. Invalid username or password.");
        username = await getInput("Enter your username: "); // Prompt for username again
        password = await getInput("Enter your password: "); // Prompt for password again
      }
    } catch (error) {
      console.error("Error during login:", error);
      break; // Exit the loop if there's an error
    }
  }
}


function askForInput(username, sharedKeySender) {
    getInput("")
      .then((input) => {
        clearLastLine(); // Assuming this function clears the last line in the console
        const ciphertext = xorCipher(input, sharedKeySender);
        console.log("You: " + input);
        ws.send(JSON.stringify({ username: username, ciphertext: ciphertext }));
        askForInput(username, sharedKeySender); // Keep asking for input
      })
      .catch((error) => {
        console.error("Error during input:", error);
    });
}


ws.on("open", async function open() {
  console.clear();
  let isLoggedIn = false; // Flag to track login state
  // Check if users.json exists, if not create it
  if (!fs.existsSync("users.json")) {
    fs.writeFileSync("users.json", JSON.stringify({}));
  }

  console.log("\nWelcome to ChatApp! What would you like to do?")
  while (true) {
    const choice = await getInput(
      "\nPlease select an option\n1. Sign up\n2. Sign in\n3. Exit Program: \n> "
    );

    switch (choice) {
      case "1":
        const username = await getInput("\nPlease enter your username: ");
        const password = await getInput("Please enter your password: ");
        await registerUser(username, password);
        // Assuming registerUser now properly handles async operations and returns a promise.
        console.clear();
        console.log("Registration complete. You can now login.");
        break;
      case "2":
        if (await login()) {
          return; // Return after successful login, avoiding displaying choices again
        } else {
            break; // Break if login returns false
        }
      case "3":
        console.log("Program Exited!");
        process.exit(1);
      default:
        console.log("Invalid choice");
    }
  }
});

ws.on("message", function incoming(message) {
  // Handle login response
  const data = JSON.parse(message);
  if (data.type !== "login") {
    const decryptedMessage = xorCipher(
      data.ciphertext,
      sharedKeySender.toString()
    );
    console.log(data.username + ": " + decryptedMessage);
  }
});
