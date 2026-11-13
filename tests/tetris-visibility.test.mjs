import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../games.js';

const idle=()=>({down:new Set(),pressed:new Set(),pointer:{active:false},sound:()=>{}});

test('falling pieces remain visible and descend after a line-clear animation',()=>{
  for (const dt of [1/120,1/60,0.2]) {
    const game=createGame('tetris');
    game.status='playing';
    game.board[19]=Array(10).fill(1);
    game.board[19][4]=0;
    game.shape=[[1]];game.x=4;game.y=19;
    const drop=idle();drop.pressed.add('Space');
    game.update(dt,drop);
    assert.equal(game.clearing.length,1);
    for(let elapsed=0;elapsed<.3;elapsed+=dt)game.update(dt,idle());
    assert.equal(game.lines,1);
    // Exercise later pieces too: dropping a hidden piece used to leave the
    // completed clear timer negative, hiding every subsequent active piece.
    for(let piece=0;piece<3;piece++) {
      const startY=game.y;
      for(let elapsed=0;elapsed<.8;elapsed+=1/120)game.update(1/120,idle());
      assert.ok(game.y>startY,'gravity advances without down or space');
      const draws=[];
      game.render({fillStyle:'#000',fillRect(x,y,w,h){draws.push({x,y,w,h,color:this.fillStyle});}});
      game.shape.forEach((row,y)=>row.forEach((occupied,x)=>{
        if(occupied&&game.y+y>=0)assert.ok(draws.some(d=>
          d.x===88+(game.x+x)*8 && d.y===24+(game.y+y)*8 &&
          d.w===7 && d.h===7 && d.color==='rgb(242,242,242)'),
          'active piece must be drawn at its current falling position');
      }));
      game.update(1/120,drop);
    }
  }
});
