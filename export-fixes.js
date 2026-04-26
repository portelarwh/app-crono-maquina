'use strict';

(function () {
  function byId(id){return document.getElementById(id);}

  function safeCloneForCapture(source){
    const clone=source.cloneNode(true);
    clone.style.background='#ffffff';
    clone.querySelectorAll('*').forEach(el=>{
      el.style.color='#000000';
      el.style.backgroundColor='#ffffff';
      el.style.boxShadow='none';
      el.style.borderColor='#cccccc';
    });
    const wrapper=document.createElement('div');
    wrapper.style.position='fixed';
    wrapper.style.left='-9999px';
    wrapper.style.top='0';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    return {clone,wrapper};
  }

  async function generateImageBlob(){
    const source=byId('exportContainer');
    if(!source) throw new Error('Container não encontrado');

    const {clone,wrapper}=safeCloneForCapture(source);

    try{
      const canvas=await html2canvas(clone,{
        scale:2,
        backgroundColor:'#ffffff'
      });

      return await new Promise(res=>canvas.toBlob(res,'image/png'));
    }finally{
      wrapper.remove();
    }
  }

  async function generatePDFBlob(){
    const blob=await generateImageBlob();
    const reader=new FileReader();
    const dataUrl=await new Promise(r=>{
      reader.onloadend=()=>r(reader.result);
      reader.readAsDataURL(blob);
    });

    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF('p','mm','a4');
    pdf.addImage(dataUrl,'PNG',0,0,210,297);
    return pdf.output('blob');
  }

  function download(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=name;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.generatePNG=async function(){
    const blob=await generateImageBlob();
    download(blob,'crono-maquina.png');
  };

  window.generateRealPDF=async function(){
    const blob=await generatePDFBlob();
    download(blob,'crono-maquina.pdf');
  };

  window.shareWhatsApp=async function(){
    const blob=await generateImageBlob();
    const file=new File([blob],'crono.png',{type:'image/png'});

    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Crono Máquina'});
    }else{
      download(blob,'crono-maquina.png');
      window.open('https://wa.me','_blank');
    }
  };
})();
