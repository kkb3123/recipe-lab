import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareNeeds, deductKnownStock, emptyQuantities, purchaseFromEntry, recordPurchase, usageFromRecipe } from '../public/pantry-quantity-model.js';
import { exportBackup, importBackup, writeStorage } from '../public/data-backup.js';

test('compares compatible units, keeps unknown and zero distinct, and sums split requirements', () => {
  const needs = [
    {name:'물',amount:.8,unit:'L'}, {name:'물',amount:100,unit:'ml'},
    {name:'양파',amount:2,unit:'개'}, {name:'당근',amount:200,unit:'g'}, {name:'달걀',amount:1,unit:'개'},
  ];
  const rows = compareNeeds(needs,{ 물:{amount:700,unit:'ml'}, 당근:{amount:1,unit:'개'}, 달걀:{amount:0,unit:'개'} });
  assert.equal(rows[0].amount,.9);
  assert.equal(rows[0].shortage,.2);
  assert.equal(rows[1].shortage,null);
  assert.equal(rows[1].stored,null);
  assert.equal(rows[2].available,null);
  assert.equal(rows[3].shortage,1);
});

test('registers each completed shopping line once and deducts a compatible original amount', () => {
  assert.equal(purchaseFromEntry('물|ml',{label:'물 800 ml',done:false}),null);
  const purchase = purchaseFromEntry('물 (식단)|L',{label:'물 (식단) 1 L',done:true});
  assert.equal(purchase.id,'물');
  const first = recordPurchase(emptyQuantities(),purchase);
  assert.equal(recordPurchase(first,purchase),null);
  assert.equal(recordPurchase(first,{...purchase,key:'다른 항목',unit:'g'}),null);
  const items = usageFromRecipe({baseServings:null,ingredients:[{name:'물',amount:250,unit:'ml'}]},8);
  const result = deductKnownStock(first,items);
  assert.deepEqual(result.state.stock.물,{amount:.75,unit:'L'});
  assert.equal(result.count,1);
});

function memoryStorage() {
  const storage = new Map();
  return { getItem:k=>storage.get(k) ?? null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
}

test('restores every group from a validated backup and keeps legacy favorite-only import scoped', () => {
  const a = memoryStorage();
  const data = {
    recipeLabFavorites:[1], recipeLabShoppingV13:{'물|ml':{label:'물 2 ml',done:true}},
    recipeLabPantryV1:['물'], recipeLabPantryQuantitiesV1:{stock:{물:{amount:2,unit:'ml'}},receipts:{'물|ml':true}},
    recipeLabMealPlanV1:{family:2,slots:{'2026-11-28/저녁':{id:1,servings:2}},submitted:{}},
  };
  writeStorage(a,data);
  const b = memoryStorage();
  importBackup(b,JSON.parse(JSON.stringify(exportBackup(a))));
  assert.deepEqual(exportBackup(b).data,data);
  importBackup(b,{app:'recipe-lab',version:1,favorites:[2]});
  assert.deepEqual(exportBackup(b).data,{...data,recipeLabFavorites:[2]});
  const broken = {app:'recipe-lab',version:2,data:{...data,recipeLabMealPlanV1:{family:0}}};
  assert.throws(()=>importBackup(b,broken),/손상/);
  assert.throws(()=>importBackup(b,{...broken,version:99}),/지원/);
  assert.deepEqual(exportBackup(b).data,{...data,recipeLabFavorites:[2]});
});
