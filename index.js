const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');
const { stdin, stdout } = process;

const crypto = require('crypto');

// Function to hash a password using SHA-256
function hashPassword(password) {
    const hash = crypto.createHash('sha256');
    hash.update(password);
    return hash.digest('hex');
}

const ws = new WebSocket('ws://localhost:8080');
let loggedIn = false; // Flag to track if the user is logged in

const clearLastLine = () => {
    process.stdout.moveCursor(0, -1); // Move cursor up one line
    process.stdout.clearLine(1); // Clear from cursor to end
};

// Function to read input from command line
function getInput(prompt) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
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
        fs.readFile('users.json', 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading users.json:', err);
                reject(err);
                return;
            }
            try {
                const users = JSON.parse(data);
                resolve(users);
            } catch (parseError) {
                console.error('Error parsing users.json:', parseError);
                reject(parseError);
            }
        });
    });
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
        if (Object.values(users).some(user => user.username === username)) {
            console.log('Username already exists');
            return;
        }

        // Check for blank username or password
        if (username === '' || password === '') {
            console.log('Username and password cannot be blank');
            return;
        }

        // Add new user to the users object
        users[id] = {
            username: username,
            password: hashPassword(password) // Assuming you have a hashPassword function
        };

        // Write updated users object back to users.json
        fs.writeFile('users.json', JSON.stringify(users, null, 4), (err) => {
            if (err) {
                console.error('Error writing to users.json:', err);
            } else {
                console.log('User registered successfully');
                console.log("Logged in as " + username);
                askForInput(username);
            }
        });
    } catch (error) {
        console.error('Error registering user:', error);
    }
}

async function login() {
    let username = await getInput('Enter your username: ');
    let password = await getInput('Enter your password: ');

    while (true) {
        try {
            const users = await readUsers();
            const userId = Object.keys(users).find(id => users[id].username === username && users[id].password === hashPassword(password));
            if (userId) {
                console.log('Login successful');
                ws.send(JSON.stringify({ type: 'login', username, password }));
                askForInput(username);
                break; // Exit the loop if login is successful
            } else {
                console.log('Login failed. Invalid username or password.');
                username = await getInput('Enter your username: '); // Prompt for username again
                password = await getInput('Enter your password: '); // Prompt for password again
            }
        } catch (error) {
            console.error('Error during login:', error);
            break; // Exit the loop if there's an error
        }
    }
}


ws.on('open', async function open() {
    console.log('Connected to server');

    // Check if users.json exists, if not create it
    if (!fs.existsSync('users.json')) {
        fs.writeFileSync('users.json', JSON.stringify({}));
    }

    const choice = await getInput('Choose an option (register / login): ');

    if (choice === 'register') {
        var username = await getInput('Enter your username: ');
        var password = await getInput('Enter your password: ');
        registerUser(username, password);
    } else if (choice === 'login') {
        login();
    } else {
        console.log('Invalid choice');
        process.exit(1);
    }
});

ws.on('message', function incoming(message) {
    // Handle login response
    const data = JSON.parse(message);
    if(data.type !== 'login') {
        console.log(data.username + ': ' + data.message);
    }
    
});

function askForInput(username) {
    getInput('').then((input) => {
        clearLastLine(); // Clear the last line
        console.log('You: ' + input);
        ws.send(JSON.stringify({ username: username, message: input }));
        askForInput(username); // Keep asking for input
    });
}