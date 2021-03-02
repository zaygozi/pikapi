# PIKAPO

What if you could talk to anyone in the world through your terminal or shell? Add to it a beautiful console, emoji support and end to end encryption. No need for web browsers. No need for servers or databases. This is the magic of p2p and this lightweight tool harvests the potential of p2p by helping you create global chatrooms around the world. Connect with anyone in seconds.

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

And thats about it. Start chatting!
