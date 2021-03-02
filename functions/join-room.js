// P2P requirements
const wrtc = require('wrtc');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const SimplePeerJs = require('simple-peerjs');

const {
    prompt
} = require('enquirer');
const CryptoJS = require('crypto-js');
const boxen = require('boxen');
const moment = require('moment');
const term = require('terminal-kit').terminal;
const cliCursor = require('cli-cursor');
const gradient = require('gradient-string');
const emoji = require('node-emoji');
const uniqid = require('uniqid');

// room variables
let conn = null; // connection string
let room = null; // room name is also the host peer id
let peer_id = uniqid();
let alias = null;
// Last ids are used to detect lost messages by the peers
let last_id = 0;
// Keep track of lost message ids
let lost_ids = [];
let passkey = null;
let auth = false;
let enc = null;
let currentInput = null;

function authenticate(conn) {
    let payload = {
        type: "auth",
        passkey: passkey,
        alias: alias
    };
    conn.peer.send(JSON.stringify(payload));
}

function joinRoom() {
    let questions = [{
            type: 'input',
            name: 'room',
            message: 'Room'
        },
        {
            type: 'password',
            name: 'passkey',
            message: 'Passkey',
            validate: (input) => {
                let value = input.trim();
                return value.length >= 8;
            }
        },
        {
            type: 'input',
            name: 'alias',
            message: 'Alias'
        }
    ];
    prompt(questions).then((answers) => {
        room = answers.room;
        passkey = answers.passkey;
        alias = answers.alias.toLowerCase();
        // Initializing host peer
        const peer = new SimplePeerJs({
            id: peer_id,
            wrtc,
            fetch,
            WebSocket,
            host: 'peerchat-broker-1.herokuapp.com',
            port: 443,
            path: '/',
            secure: true
        });
        // Preparing console
        peer.id.then((id) => {
            console.log(`Configured id : ${id}`);
            console.log('Initiating connection....');
            peer.connect(room);
        }, (err) => {
            console.error(err);
        });
        // Handling incoming connections
        peer.on('connect', (connection) => {
            conn = connection;
            // Authenticating with host
            authenticate(conn);

            // Handling incoming messages
            conn.peer.on('data', (data) => {

                let payload = JSON.parse(data);

                // Accepting config after successful auth
                if (payload.type === 'conf') {
                    console.log('Authentication complete');
                    console.log('Preparing console....');
                    enc = payload.enc;
                    last_id = payload.last_id;

                    // Prepare console
                    console.clear();
                    console.log(boxen(gradient.pastel(`Room : ${room}\nEncryption : ${enc}`), {
                        padding: 1,
                        margin: 1,
                        borderStyle: 'singleDouble',
                        align: 'center',
                        float: 'center',
                        borderColor: 'yellowBright'
                    }));
                    term('\n\n');
                    term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                    term.bold.brightYellow(`Howdy soldier! Write something to initiate communication.`);
                    takeInput();
                    return auth = true;
                }

                // Handling auth error
                if (payload.type === 'auth-error') {
                    console.log(payload.msg);
                    conn.peer.destroy();
                    term('\n');
                    return process.exit();
                }

                // Bot messages (no need of decryption)
                if (payload.from === 'bot') {
                    if (!auth) {
                        return authenticate(conn);
                    }
                    if (payload.msg !== `${alias} has joined`) {
                        currentInput.hide();
                        term.bold.brightYellow(`[${moment().format('HH:mm')}] (${payload.alias}) `);
                        term.bold.brightYellow(payload.msg);
                        return takeInput();
                    }
                }

                if (payload.id === last_id + 1) {
                    if (!auth) {
                        return authenticate(conn);
                    }
                    // No data loss
                    last_id = payload.id;
                    // Avoid printing messages from self
                    if (payload.from !== peer_id && payload.from !== 'bot') {
                        let decrypted = null;
                        if (enc === 'AES') {
                            let bytes = CryptoJS.AES.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        } else {
                            let bytes = CryptoJS.Rabbit.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        }
                        currentInput.hide();
                        term.bold.brightGreen(`[${moment().utc().format('HH:mm')}] (${payload.alias}) `);
                        term.bold.brightGreen(emoji.emojify(decrypted));
                        takeInput();
                    }
                } else if (lost_ids.includes(payload.id)) {
                    if (!auth) {
                        return authenticate(conn);
                    }
                    // we are dealing with a successful resend request
                    lost_ids.splice(lost_ids.indexOf(payload.id), 1);
                    if (payload.from !== peer_id && payload.from !== 'bot') {
                        let decrypted = null;
                        if (enc === 'AES') {
                            let bytes = CryptoJS.AES.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        } else {
                            let bytes = CryptoJS.Rabbit.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        }
                        currentInput.hide();
                        term.bold.brightGreen(`[${moment().utc().format('HH:mm')}] (${payload.alias}) `);
                        term.bold.brightGreen(emoji.emojify(decrypted));
                        takeInput();
                    }
                } else {
                    if (!auth) {
                        return authenticate(conn);
                    }
                    // Data loss (so send a request for the missing msgs)
                    for (let i = last_id + 1; i < payload.id; i++) {
                        lost_ids.push(i);
                        let request = {
                            type: 'req',
                            req: i
                        };
                        conn.peer.send(JSON.stringify(request));
                    }
                    // Avoid printing messages from self and duplicates
                    if (payload.from !== 'test2' && payload.id > last_id && payload.from !== 'bot') {
                        last_id = payload.id;
                        let decrypted = null;
                        if (enc === 'AES') {
                            let bytes = CryptoJS.AES.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        } else {
                            let bytes = CryptoJS.Rabbit.decrypt(payload.msg, passkey);
                            decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        }
                        currentInput.hide();
                        term.bold.brightGreen(`[${moment().utc().format('HH:mm')}] (${payload.alias}) `);
                        term.bold.brightGreen(emoji.emojify(decrypted));
                        takeInput();
                    }
                }

            });

            // Handling host disconnect
            conn.peer.on('close', () => {
                if (!auth) {
                    return console.log('Connection rejected!');
                }
                conn.peer.destroy();
                currentInput.hide();
                term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                term.bold.brightYellow(`Connection with host lost or host has abandoned the room! Self destructing in 15 seconds`);
                setTimeout(() => {
                    term('\n\n');
                    console.clear();
                    process.exit();
                }, 15000);
            });

        });

        // Handling error
        peer.on('error', (err) => {
            if (err.code === 'ERR_CONNECTION_FAILURE') {
                console.log('Unable to establish connection with remote peer!');
            } else if (err.code === 'ERR_WEBRTC_SUPPORT') {
                console.log('Webrtc error!');
            } else if (err.code === 'ERR_SIGNALING') {
                console.log('Signaling server error!');
            } else if (err.type === 'unavailable-id') {
                console.log('There was a problem in assigning id!');
                console.log(' ');
                return joinRoom();
            } else {
                console.log(err);
            }
        });

    }, (err) => {
        // when cli crashes or ctrl+c is used
        term('\n');
        process.exit();
    });
}

// Handles user input
function takeInput() {
    if (!currentInput) {
        term('\n\n');
        cliCursor.show();
        currentInput = term.inputField((err, message) => {
            if (err) throw err;
            let encrypted = null;
            if (message.trim() === 'exit') {
                term('\n\n');
                console.clear();
                process.exit();
            } else if (message.trim() === 'dloss') {
                currentInput.hide();
                term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                term.bold.brightYellow(`Approx data loss : ${(lost_ids.length/last_id)*100}%`);
                currentInput = null;
                takeInput();
            } else if (message.trim().length === 0) {
                // Dont send blank space
            } else {
                if (enc === 'AES') {
                    encrypted = CryptoJS.AES.encrypt(message.trim(), passkey).toString();
                } else {
                    encrypted = CryptoJS.Rabbit.encrypt(message.trim(), passkey).toString();
                }
                let payload = {
                    type: 'msg',
                    from: peer_id,
                    msg: encrypted,
                    alias: alias
                };
                conn.peer.send(JSON.stringify(payload));
                currentInput = null;
                takeInput();
            }
        });
    } else {
        term('\n\n');
        currentInput.rebase();
        cliCursor.show();
    }
}

module.exports = {
    joinRoom
};