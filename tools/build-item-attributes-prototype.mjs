// Snapshot generator for the independent prototype. Never modifies game catalogues.
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const items=read('data/items.json'), wood=items.wood_firewood_dry, battery=items.battery_aa;
const base=t=>({identity:{name:t.sn,appearance:t.placeholder_name,description:t.fn},stacking:{limit:t.stack_limit}});
const catalog={schema_version:1,provenance:{wood_firewood_dry:'现有干木材快照；燃料值为0，旧构建也给无此用途的物品补0，不能据此认定燃料用途。本例保留堆肥碳68/氮2，燃料用于手动试配。',example_apple:'普通苹果不存在于当前目录；所有数值仅用于验证结构，不是正式新增物品。',battery_aa:'现有五号电池快照；容量100、初始电量100、重量0.03kg。认知条件为试作演示。'},items:[
 {item_id:wood.item_id,editor_name:wood.sn,weight_kg:wood.weight_kg,attribute_modules:{base:'wood',production:'wood'}},
 {item_id:'example_apple',editor_name:'苹果（示例）',weight_kg:0.2,attribute_modules:{base:'apple',food:'apple',production:'apple'}},
 {item_id:battery.item_id,editor_name:battery.sn,weight_kg:battery.weight_kg,attribute_modules:{base:'battery',energy:'battery'}}
],configs:{base:{wood:base(wood),apple:{identity:{name:'苹果',appearance:'红色圆果',description:'带着果香的红苹果。'},stacking:{limit:5},spoilage:{duration:60}},battery:base(battery)},food:{apple:{nutrition:{satiety:10,water:0}}},production:{wood:{compost:{carbon:Number(wood.fert_c),nitrogen:Number(wood.fert_n)}},apple:{cooking:{kind:'水果'}}},energy:{battery:{storage:{capacity:battery.battery_capacity,initial_charge:battery.battery_charge}}}}};
fs.writeFileSync(new URL('./item-attributes-prototype.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');
console.log('Prototype snapshot generated: 3 items; no production files changed.');
