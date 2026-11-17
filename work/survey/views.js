// Scene URLs follow the public panorama player's media-name convention.
// Offsets are horizontal distances from our viewpoints to the recorded camera positions.
const surveyLocations = [
 ['Gornji-Grad','13_10_2023_005',7,'Победитель'],
 ['Gornji-Grad','10_10_2023_015',7,'Стамбольские ворота'],
 ['Gornji-Grad','11_10_2023_007',6,'Верхний город'],
 ['Donji-Grad','24_10_2023_012',279,'Нижний город'],
 ['Gornji-Grad','12_10_2023_056',5,'Зиндан-капия'],
 ['Park-Kalemegdan','23_10_2023039',11,'Большой Калемегдан'],
 ['Gornji-Grad','FAR_Scan_107',6,'Лапидарий']
];
function showSurvey(index) {
 const [part,media,distance,title] = surveyLocations[index];
 const dialog = document.getElementById('survey');
 const frame = document.getElementById('survey-frame');
 const panorama = 'https://kalemegdan.geo.rs/'+part+'/index.htm?skip-loading&media-name='+media;
 const scans = {
  victor:['https://sketchfab.com/models/8c8fcce0924e4b218e3e50140092fa3b/embed',
   'https://sketchfab.com/3d-models/8c8fcce0924e4b218e3e50140092fa3b','Памятник «Победитель» · Marko_BG'],
  gate:['https://sketchfab.com/models/096eac92398f4723b09076cb8d8c0632/embed',
   'https://sketchfab.com/3d-models/096eac92398f4723b09076cb8d8c0632','Ворота Карла VI · Ilya.Shevelev · CC BY 4.0'],
  pano:[panorama,panorama,title+' · панорама в '+distance+' м от точки прогулки']
 };
 function select(mode) {
  const [src,link,label] = scans[mode];
  frame.title = label;
  frame.src = src;
  document.getElementById('survey-caption').textContent = label;
  document.getElementById('survey-external').href = link;
  dialog.querySelectorAll('[data-survey]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.survey===mode)));
 }
 dialog.querySelectorAll('[data-survey]').forEach(b=>b.onclick=()=>select(b.dataset.survey));
 document.getElementById('survey-close').onclick=()=>dialog.close();
 dialog.onclose=()=>frame.removeAttribute('src');
 dialog.showModal();
 select('pano');
}
