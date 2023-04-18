---
title: A Monty Hall Problem simulation
date: 2021-07-18T04:13:08.308Z
draft: false
---


The Monty Hall problem is quite a brain teaser, can be explained as follow:
> *Suppose you’re on a game show, and you’re given the choice of three doors: Behind one door is a car; behind the others, goats. You pick a door, say № 1, and the host, who knows what’s behind the doors, opens another door, say № 3, which has a goat. He then says to you, “Do you want to pick door № 2?” Is it to your advantage to switch your choice?*

![First](https://cdn-images-1.medium.com/max/3840/1*3QXgy4iSrbk9iXOwHjATSw.png)

We all know that switch your choice is the will give you the advantage that you need to win the car. But is it really? Still has some confusion from all the explanation you can find on the Internet? Yeah, me too! So I had to do a simulation to verify what I believe is true, is really true.

Let’s start with a simple function to generate the 3 doors, Suppose that if value at the door is **true**, that door has the price. Simple enough.

```ts
const random = require('random');

function prepare() {
  const priceIdx = random.int(0, 2);
  return [...Array(3)].map((_, index) => index === priceIdx);
}
```

And then original pick can be a random number.

```ts
const pick = random.int(0, 2);
```

And now we want to simulate the host opening a door that does not have the price. Yes, I know, how badly implemented this is, this will continue to randomly select a door to open, until the door is not picked by the player, and is not a door with the price.

```ts
function hostOpen(doors, pick) {
  let open = pick;
  do {
    open = random.int(0, 2);
    if (!doors[open] && open !== pick) {
      break;
    }
  } while (true);
  return open;
}
```

And then the player switch their pick. I know, more bad implementation,… anyway.

```ts
function switchPick(pick, open) {
  return [...Array(3)]
    .findIndex(
      (_, index) => index !== open && index !== pick
    );
}
```

So, the simulation (ran for 1000000 times) really does show that switching your choice will give you 2/3 chance of getting the price. I also throw in the “Keep” option simulation, and as expected, it’s 1/3 chance to get the price. Who’d have guess?????

> Win (Switch): 66.689%  
> Win (Keep): 33.346399999999996%

If you still cannot tell how bored I am now, well, duh!
