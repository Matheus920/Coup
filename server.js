let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let uuid = require('uuid')
let players = [];
let deck = [];
let currentTurn = 0;
let blockResponses = [];
let discardedCards = [];
let doubtResponses = [];
let inAwait = null;
let actionInAwait = null;
let hasBegun = false;
let room = "";
let porta = process.env.PORT || 3000

function montaDeck(){
    for(let i =0; i<20; i+=5){
        deck[i] = {'name': "Assassino", 'id': uuid.v4()}
        deck[i+1] = {'name': "Condessa", 'id': uuid.v4()}
        deck[i+2] = {'name': "Duque", 'id': uuid.v4()}
        deck[i+3] = {'name': "Embaixador", 'id': uuid.v4()}
        deck[i+4] = {'name': "Capitão", 'id': uuid.v4()}
    }
}

function recallAndShuffle(){
    for(card of discardedCards){
        deck.push(card)
    }
    discardedCards = []
    deck = shuffle(deck)
}

function mudaTurno(){
    if(currentTurn+1 == players.length){
        currentTurn = 0
    }else {
        currentTurn++
    }
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
});

http.listen(porta, () => {
    console.log('Listening on port *: ' + porta);
});

io.on('connection', (socket) => {
    socket.on('ajuda-externa', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'Solicitou ajuda externa',
            user: data.user
        });

        for(player of players){
            if(player.id == data.id)
                player.coins+= 1;
        }

        io.sockets.to(room).emit('joined', players);
        io.sockets.to(room).emit('turnoMudou', {
            id: players[currentTurn].id,
            user: players[currentTurn].username
        })
        mudaTurno()
    });
    socket.on('room', (data) => {
        if(room){
            if(data.room != room){
                socket.emit('salaNaoEncontrada')
                return;
            }

            if(hasBegun){
                socket.emit('jaIniciou')
                return;
            }
        }

        room = data.room;
        socket.join(data.room);
        socket.emit('salaEncontrada')
    })
    socket.on('joined', (data) => {
        if(players.length == 0){
            montaDeck();
            deck = shuffle(deck);
        }

        data.cards = [deck.pop(), deck.pop()];

        players.push(data);
        io.sockets.to(room).emit('deckChanges', {cards: data.cards, id: data.id});
        io.sockets.to(room).emit('joined', players);
        io.sockets.to(room).emit('deckLength', {length: deck.length})
    });
    socket.on('pegar2', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'Gostaria de pegar 2.',
            user: data.user
        });

        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Duque", acao: 'pegar2'})
        inAwait = {id: data.id, user: data.user, acao: 'pegar2'};
    })
    socket.on('bloquear', (data) => {
        blockResponses.push(data)
            if(blockResponses.length == players.length-1){
                let control;
                for(response of blockResponses){
                    control = response
                    if(control.status) break;
                }
                if(!control.status){
                    io.sockets.to(room).emit('chat-message', {
                        message: 'Não foi contestado.',
                        user: inAwait.user
                    });

                    if(data.acao == 'pegar2'){
                        for(player of players){
                            if(player.id == inAwait.id)
                                player.coins += 2
                        }
                        inAwait = {}
                    }
                    if(data.acao == 'roubar2'){
                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: inAwait.user,
                            id: inAwait.id,
                            tipo: ['Capitão']
                        })
                        actionInAwait = inAwait
                    }
                    if(data.acao == 'assassinar'){
                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: inAwait.user,
                            id: inAwait.id,
                            tipo: ['Assassino']
                        })
                        actionInAwait = inAwait
                    }
                    blockResponses = []
                    io.sockets.to(room).emit('joined', players);
                    io.sockets.to(room).emit('turnoMudou', {
                        id: players[currentTurn].id,
                        user: players[currentTurn].username
                    })  
                    mudaTurno()          
                }else {
                    if(data.acao == 'pegar2'){
                        io.sockets.to(room).emit('chat-message', {
                            message: 'O jogador declara ser o Duque e quer bloquear seu movimento.',
                            user: control.user
                        })

                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: control.user,
                            id: control.id,
                            tipo: ['Duque']
                        })
                        inAwait = control
                        inAwait.acao == 'blockPegar2'
                        actionInAwait = inAwait
                        blockResponses = []
                    }
                    else if(data.acao == 'roubar2'){
                        io.sockets.to(room).emit('chat-message', {
                            message: 'O jogador declara ser o Capitão/Embaixador e quer bloquear seu movimento.',
                            user: control.user
                        })

                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: control.user,
                            id: control.id,
                            tipo: ["Capitão", "Embaixador"]
                        })
                        control.acao = "blockRoubo"
                        actionInAwait = inAwait
                        actionInAwait.acao = "blockRoubo"
                        inAwait = control
                        blockResponses = []
                    }
                    else if(data.acao == 'assassinar'){
                        io.sockets.to(room).emit('chat-message', {
                            message: 'O jogador declara ser a Condessa e quer bloquear seu movimento.',
                            user: control.user
                        })

                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: control.user,
                            id: control.id,
                            tipo: ["Condessa"]
                        })
                        control.acao = "blockAssassinato"
                        actionInAwait = inAwait
                        actionInAwait.acao = "blockAssassinato"
                        inAwait = control
                        blockResponses = []
                    }
                }
            }
    })

    socket.on('duvidar', (data) => {
        doubtResponses.push(data);
        if(doubtResponses.length == players.length-1){
            let control;
            for(doubt of doubtResponses){
                control = doubt;
                if(control.status) break;
            }
            if(!control.status){
                if(actionInAwait.acao == 'duque3'){
                    for(player of players){
                        if(player.id == actionInAwait.id){
                            player.coins += 3;
                        }
                    }
                }

                if(actionInAwait.acao == 'roubar2'){
                    for(player of players){
                        if(player.id == actionInAwait.id){
                            player.coins += 2;
                        }
                        if(player.id == actionInAwait.idPlayer){
                            player.coins -= 2;
                        }
                    }
                }

                if(actionInAwait.acao == 'assassinar'){
                    for(player of players){
                        if(player.id == actionInAwait.idPlayer){
                            io.sockets.to(room).emit('descartarCard', {
                                id: player.id
                            })
                        }
                    }
                }

                if(actionInAwait.acao == 'olharTopo'){
                    let cards = []
                    for(player of players){
                        if(player.id == actionInAwait.id){
                            if(deck.length < 2){
                                recallAndShuffle()
                            }
                            player.cards.push(deck.pop())
                            player.cards.push(deck.pop())
                            cards = player.cards
                        }
                    }

                    io.sockets.to(room).emit('discardedCards', discardedCards)
                    io.sockets.to(room).emit('deckLength', {length: deck.length})
                    io.sockets.to(room).emit('deckChanges', {
                        cards: cards,
                        id: actionInAwait.id
                    })
                    io.sockets.to(room).emit('podeOlhar', {
                        id: actionInAwait.id
                    })
                }

                io.sockets.to(room).emit('chat-message', {
                    message: 'Não foi contestado.',
                    user: actionInAwait.user
                });

                io.sockets.to(room).emit('turnoMudou', {
                    id: players[currentTurn].id,
                    user: players[currentTurn].username
                })
                mudaTurno()

                io.sockets.to(room).emit('joined', players);
                inAwait = {}
                actionInAwait = {}

            } else {
                io.sockets.to(room).emit('chat-message', {
                    message: 'O jogador duvida da sua informação.',
                    user: control.user
                });

                io.sockets.to(room).emit('provar', {
                    user: inAwait.user,
                    id: inAwait.id,
                    tipo: control.tipo
                })

                inAwait = control

            }
            doubtResponses = []
        }
    })
    socket.on('provaCorreta', (data) => {
        let newCards = []
        for(player of players){
            if(player.id == data.id){
                discardedCards.push(player.cards[data.cardIndex])
                if(deck.length < 1){
                    recallAndShuffle()
                }
                player.cards[data.cardIndex] = deck.pop()
                newCards = player.cards
            }
        }
        io.sockets.to(room).emit('deckChanges', {
            cards: newCards,
            id: data.id
        });

        io.sockets.to(room).emit('deckLength', {
            length: deck.length
        })

        io.sockets.to(room).emit('discardedCards', discardedCards)

        io.sockets.to(room).emit('chat-message', {
            message: 'Não estava mentindo.',
            user: data.user
        });

        if(actionInAwait.acao == 'duque3'){
            for(player of players){
                if(player.id == actionInAwait.id){
                    player.coins += 3;
                }
            }
        }

        if(actionInAwait.acao == 'roubar2'){
            for(player of players){
                if(player.id == actionInAwait.id){
                    player.coins += 2;
                }
                if(player.id == actionInAwait.idPlayer){
                    player.coins -= 2;
                }
            }
        }

        if(actionInAwait.acao == 'assassinar'){
            for(player of players){
                if(player.id == actionInAwait.idPlayer){
                    io.sockets.to(room).emit('perdeuOJogo', {
                        id: player.id,
                        user: player.user
                    })
                    players.splice(players.findIndex(i => i.id == player.id), 1);
                    if(players.length == 1){
                        io.sockets.to(room).emit('winner', {
                            id: players[0].id
                        })
                        return
                    }
                    
                }
            }
        }

        io.sockets.to(room).emit('joined', players)

        io.sockets.to(room).emit('descartarCard', {
            id: inAwait.id
        })
        
        inAwait = {}
        actionInAwait = {}
    })
    socket.on('realizarDescarte', (data) => {
        let newCards = []
        let oldCard = []
        for(player of players){
            if(player.id == data.id){
                oldCard = player.cards.splice(data.cardIndex, 1)
                discardedCards.push(oldCard[0])
                newCards = player.cards
                if(newCards.length == 0){
                    io.sockets.to(room).emit('perdeuOJogo', {
                        user: player.user,
                        id: player.id
                    })
                    players.splice(players.findIndex(i => i.id == player.id), 1)
                    if(players.length == 1){
                        io.sockets.to(room).emit('winner', {
                            id: players[0].id
                        })
                        return
                    }
                    io.sockets.to(room).emit('joined', players)
                }
            }
        }

        io.sockets.to(room).emit('discardedCards', discardedCards)
        io.sockets.to(room).emit('deckChanges', {cards: newCards, id: data.id});
        io.sockets.to(room).emit('chat-message', {
            message: 'Realizou o descarte de ' + oldCard[0].name,
            user: data.user
        });
        io.sockets.to(room).emit('turnoMudou', {
            id: players[currentTurn].id,
            user: players[currentTurn].username
        })
        mudaTurno()
    })
    socket.on('duque3', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'O jogador declara ser Duque e quer pegar 3.',
            user: data.user
        });

        socket.broadcast.to(room).emit('declaracaoInfluencia',
         {
            tipo: "Duque", 
            user: data.user,
            id: data.id,
        });

        actionInAwait = {id: data.id, user: data.user, acao: 'duque3'};
        inAwait = {id: data.id, user: data.user, acao: 'duque3'};
    })
    socket.on('roubar2', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'O jogador declara ser Capitão e quer roubar de ' + data.player.username,
            user: data.user
        });

        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Capitão/Embaixador", acao: 'roubar2'})
        inAwait = {id: data.id, user: data.user, acao: 'roubar2', idPlayer: data.player.id};
    })
    socket.on('assassinar', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'O jogador declara ser Assassino e quer matar ' + data.player.username,
            user: data.user
        })

        for(player of players){
            if(player.id == data.id){
                player.coins -= 3;
            }
        }

        io.sockets.to(room).emit('joined', players);
        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Condessa", acao: 'assassinar'})
        inAwait = {id: data.id, user: data.user, acao: 'assassinar', idPlayer: data.player.id};
    })
    socket.on('sair', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'O jogador saiu',
            user: data.user
        })

        for(player of players){
            if(player.id == data.id){
                players.splice(players.findIndex(i => i.id == player.id), 1)
                if(players.length == 1 && hasBegun){
                    io.sockets.to(room).emit('winner', {
                        id: players[0].id
                    })
                    return
                }
                if(players.length == 0){
                    room = null
                    players = []
                    hasBegun = false
                    doubtResponses = []
                    blockResponses = []
                    discardedCards = []
                    socket.emit('fimDeJogo')
                    return
                }
            }
        }

        socket.emit('fimDeJogo')
        io.sockets.to(room).emit('joined', players)

    })
    socket.on('disconnect', () => {
        socket.disconnect()
    })
    socket.on('iniciar', () =>{
        hasBegun = true
        io.sockets.to(room).emit('jogoIniciado')
        io.sockets.to(room).emit('turnoMudou', {
            id: players[currentTurn].id,
            user: players[currentTurn].username
        })
        mudaTurno()
    })
    socket.on('golpeDeEstado', (data) => {
        io.sockets.to(room).emit('chat-message', {
          message:  'O jogador deseja dar um golpe de estado em ' + data.player.username,
          user: data.user
        })

        for(player of players){
            if(player.id == data.id){
                player.coins -= 7;
            }
        }

        io.sockets.to(room).emit('joined', players)
        io.sockets.to(room).emit('descartarCard', {
            id: data.player.id
        })
    })
    socket.on('embaixador', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message:  'O jogador declara ser embaixador e gostaria de olhar as 2 do topo',
            user: data.user
        })

        socket.broadcast.to(room).emit('declaracaoInfluencia',
         {
            tipo: "Embaixador", 
            user: data.user,
            id: data.id,
        });

        inAwait = {id: data.id, user: data.user, acao: 'olharTopo'};
        actionInAwait = inAwait

    })
    socket.on('confirmacaoEmbaixador', (data) => {
        deck.push(data.secondSelection)
        deck.push(data.firstSelection)

        let cards = []
        for(player of players){
            if(player.id == data.id){
                player.cards.splice(player.cards.findIndex(i => i.id === data.firstSelection.id), 1)
                player.cards.splice(player.cards.findIndex(i => i.id === data.secondSelection.id), 1)
                cards = player.cards
            }
        }

        io.sockets.to(room).emit('deckChanges', {cards: cards, id: data.id})
    })
    socket.on('reiniciarJogo', () => {
        room = null
        players = []
        hasBegun = false
        discardedCards = []
        doubtResponses = []
        blockResponses = []
        currentTurn = 0
    })
});

