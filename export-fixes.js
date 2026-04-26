'use strict';

(function(){
  function $(id){return document.getElementById(id)}

  function buildA4Report(){
    const wrapper=document.createElement('div');
    wrapper.style.position='fixed';
    wrapper.style.left='-9999px';
    wrapper.style.top='0';

    const report=document.createElement('div');
    report.style.width='794px';
    report.style.minHeight='1123px';
    report.style.background='#fff';
    report.style.padding='32px';
    report.style.fontFamily='Arial, sans-serif';
    report.style.color='#000';

    report.innerHTML=`
      <h1 style="margin:0 0 10px 0">Relatório de Cronoanálise</h1>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:20px">
        <div>
          <div><strong>Equipamento:</strong> ${$('equipName')?.value||'-'}</div>
          <div><strong>Analista:</strong> ${$('analystName')?.value||'-'}</div>
        </div>
        <div>
          <div><strong>Data:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Amostras:</strong> ${$('valSamples')?.textContent||'0'}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        <div>Ciclo médio: ${$('valAvgCycle')?.textContent}</div>
        <div>Capacidade: ${$('valHourlyCap')?.textContent}</div>
        <div>Eficiência: ${$('valEfficiency')?.textContent}</div>
        <div>Desvio: ${$('valStdDev')?.textContent}</div>
        <div>Mínimo: ${$('valMinCycle')?.textContent}</div>
        <div>Máximo: ${$('valMaxCycle')?.textContent}</div>
      </div>

      <h3>Resumo</h3>
      <p>${$('printExecutiveSummary')?.textContent||'-'}</p>
    `;

    wrapper.appendChild(report);
    document.body.appendChild(wrapper);
    return {wrapper,report};
  }

  async function exportPNG(){
    const {wrapper,report}=buildA4Report();
    const canvas=await html2canvas(report,{scale:2,backgroundColor:'#fff'});
    const link=document.createElement('a');
    link.download='relatorio.png';
    link.href=canvas.toDataURL();
    link.click();
    wrapper.remove();
  }

  async function exportPDF(){
    const {wrapper,report}=buildA4Report();
    const canvas=await html2canvas(report,{scale:2,backgroundColor:'#fff'});
    const img=canvas.toDataURL();
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF('p','mm','a4');
    pdf.addImage(img,'PNG',0,0,210,297);
    pdf.save('relatorio.pdf');
    wrapper.remove();
  }

  window.generatePNG=exportPNG;
  window.generateRealPDF=exportPDF;
})();
