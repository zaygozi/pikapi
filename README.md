# PIKAPO

What if you could talk to anyone in the world through your terminal or shell? Add to it a beautiful console, emoji support and end to end encryption. No need for web browsers. No need for servers or databases. This is the magic of p2p and this lightweight tool harvests the potential of p2p by helping you create global chatrooms or join existing rooms. Connect with anyone around the world in seconds.

### INSTALL

```
npm i -g pikapo
```

If you get an error regarding ```node-pre-gyp``` you will need to perform this additional step

```
npm i -g node-pre-gyp
```

Once installed you could use ```pikapo``` or ```pk``` command to interact with the tool.

### OPTIONS

There are just two options:

Host a chatroom. Fill in the room name, shared passkey, encryption algorithm and your unique alias for the room
```
pk host
```

Join a chatroom. Fill in the room name, shared passkey and your unique alias for the room
```
pk connect
```

And thats about it. Start talking!

### ARCHITECTURE

P2P broadcast can be implemented using a full mesh network or star network. Pikapo uses start network, where the host acts as a hub and every connected peer is a spoke. There are pros and cons to both implementations. Here are the advantages gained by pikapo using start network:

##### Serial ID
Every message arriving at the hub is assigned a serial id, before being pushed into a message queue. The ids are simply whole numbers starting from 1. The id of the last arriving message is synced across peers. This helps peers detect missing messages. They then send a resend request for the message to the hub. And the hub fetches the lost message from the rolling archive and sends it back to the requesting peer.

##### Rolling Archive
The host maintains a rolling archive, which clears itself every 5 minutes. Every message cleared from the message queue is sent to this archive.

And here are the cons:

##### Host keeps the room alive
Once the host exits, the room self destructs in 10 seconds following a farewell from our beloved bot. The room name is released and can be recreated by another host.

##### Host chooses the passkey and encryption algorithm
As stated host is the creator, designer and destroyer.

### Room Commands

##### exit
Closes the connection and exits the room. If you are a participant, your departure will be announced to all the members. If you are the host, the room will self destruct after your departure.

##### members
A command for the host. Prints out a list of all the members in the room.

##### dloss
A command for the participants. Provides real time data loss percentage. The data loss may not be sustained as most lost messages arrive late or are requested from the archive. This command can still help detect connection problems. If there is an increased data loss over time, across several peers, there might be a problem with the host.

### Encryption

2 encryption algorithms are available : AES & RABBIT. The messages are encrypted using an encryption key created from the shared passkey. Crypto Js handles the encryption and decryption.
