import { useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { fabric } from 'fabric';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

export default function PdfViewer() {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const pageEditsRef = useRef({});

  const renderPage = async (pdfDoc, pageNumber) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Save current page's edits
    if (fabricRef.current && pageNum) {
      pageEditsRef.current[pageNum] = fabricRef.current.toJSON();
      fabricRef.current.dispose();
    }

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    const overlay = document.getElementById('fabricCanvas');
    overlay.width = canvas.width;
    overlay.height = canvas.height;

    const fabricCanvas = new fabric.Canvas(overlay, { selection: true });
    fabricRef.current = fabricCanvas;

    // Restore previous edits
    if (pageEditsRef.current[pageNumber]) {
      fabricCanvas.loadFromJSON(
        pageEditsRef.current[pageNumber],
        fabricCanvas.renderAll.bind(fabricCanvas)
      );
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    const arrayBuffer = await file.arrayBuffer();
    const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setPdf(loadedPdf);
    setNumPages(loadedPdf.numPages);
    setPageNum(1);
    pageEditsRef.current = {}; // clear past edits
    renderPage(loadedPdf, 1);
  };

  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas || !fabric.Textbox) return;

    const text = new fabric.Textbox('Your Text Here', {
      left: 100,
      top: 100,
      fill: 'black',
      fontSize: 16,
    });

    canvas.add(text);
    text.bringToFront();
  };

  const blurArea = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 100,
      height: 50,
      fill: 'rgba(0,0,0,0.1)',
      stroke: 'black',
      strokeDashArray: [5, 5],
      blurTag: true,
      selectable: true,
    });

    canvas.add(rect);
    rect.bringToFront();
  };

  const applyBlur = () => {
    const canvas = fabricRef.current;
    const pdfCanvas = canvasRef.current;
    if (!canvas || !pdfCanvas) return;

    const blurBoxes = canvas.getObjects('rect').filter(obj => obj.blurTag);

    blurBoxes.forEach((rect) => {
      const { left, top, width, height } = rect;
      const x = left;
      const y = top;
      const w = width * rect.scaleX;
      const h = height * rect.scaleY;

      const ctx = pdfCanvas.getContext('2d');
      const imageData = ctx.getImageData(x, y, w, h);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);

      const dataURL = tempCanvas.toDataURL();

      fabric.Image.fromURL(dataURL, (img) => {
        img.set({
          left: x,
          top: y,
          scaleX: 1,
          scaleY: 1,
          selectable: true,
        });

        img.filters.push(new fabric.Image.filters.Blur({ blur: 0.8 }));
        img.applyFilters();

        canvas.remove(rect);
        canvas.add(img);
        img.bringToFront();
      });
    });
  };

  const eraseArea = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 100,
      height: 50,
      fill: 'white',
    });

    canvas.add(rect);
    rect.sendToBack();
  };

  const savePdf = async () => {
    if (!pdf) return;

    // Save current page edits before exporting
    if (fabricRef.current && pageNum) {
      pageEditsRef.current[pageNum] = fabricRef.current.toJSON();
      fabricRef.current.dispose();
    }

    const pdfDoc = await PDFDocument.create();

    for (let pageIndex = 1; pageIndex <= numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1.5 });

      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = viewport.width;
      renderCanvas.height = viewport.height;
      const renderCtx = renderCanvas.getContext('2d');

      await page.render({ canvasContext: renderCtx, viewport }).promise;

      const fabricCanvas = new fabric.Canvas(document.createElement('canvas'), {
        width: renderCanvas.width,
        height: renderCanvas.height,
      });

      // Load saved edits
      if (pageEditsRef.current[pageIndex]) {
        await new Promise((res) =>
          fabricCanvas.loadFromJSON(pageEditsRef.current[pageIndex], () => {
            fabricCanvas.renderAll();
            res();
          })
        );
      }

      const mergedCanvas = document.createElement('canvas');
      mergedCanvas.width = renderCanvas.width;
      mergedCanvas.height = renderCanvas.height;
      const mergedCtx = mergedCanvas.getContext('2d');

      mergedCtx.drawImage(renderCanvas, 0, 0);

      const overlayImage = new Image();
      overlayImage.src = fabricCanvas.toDataURL();

      await new Promise((res) => {
        overlayImage.onload = () => {
          mergedCtx.drawImage(overlayImage, 0, 0);
          res();
        };
      });

      const mergedDataUrl = mergedCanvas.toDataURL('image/png');
      const pngImage = await pdfDoc.embedPng(mergedDataUrl);
      const newPage = pdfDoc.addPage([mergedCanvas.width, mergedCanvas.height]);

      newPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: mergedCanvas.width,
        height: mergedCanvas.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'edited.pdf';
    link.click();
  };

  return (
    <div className="p-4 space-y-4">
      <label className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer inline-block">
        Upload PDF
        <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-gray-500 text-white px-4 py-2 rounded"
          onClick={() => {
            const newPage = pageNum - 1;
            if (newPage >= 1) {
              setPageNum(newPage);
              renderPage(pdf, newPage);
            }
          }}
          disabled={pageNum <= 1}
        >
          Prev
        </button>

        <button
          className="bg-gray-500 text-white px-4 py-2 rounded"
          onClick={() => {
            const newPage = pageNum + 1;
            if (newPage <= numPages) {
              setPageNum(newPage);
              renderPage(pdf, newPage);
            }
          }}
          disabled={pageNum >= numPages}
        >
          Next
        </button>

        <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={addText}>
          Add Text
        </button>
        <button className="bg-yellow-500 text-white px-4 py-2 rounded" onClick={blurArea}>
          Blur Area
        </button>
        <button className="bg-purple-600 text-white px-4 py-2 rounded" onClick={applyBlur}>
          Apply Blur
        </button>
        <button className="bg-red-500 text-white px-4 py-2 rounded" onClick={eraseArea}>
          Erase Area
        </button>
        <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={savePdf}>
          Save PDF
        </button>
      </div>

      <div className="relative border shadow max-w-full w-fit">
        <canvas ref={canvasRef} className="absolute top-0 left-0 z-0" />
        <canvas id="fabricCanvas" className="relative z-10" />
      </div>
    </div>
  );
}
