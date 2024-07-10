self.onmessage = async function(e) {
  const { patient, session, imageType, qcType, index, sessionId } = e.data;
  
  const headers = {
      'X-Session-Id': sessionId
  };

  try {
      const niftiResponse = await fetch(`/nifti-files/${patient}/${session}?imageType=${imageType}`, { headers });
      if (!niftiResponse.ok) {
          throw new Error(`HTTP error! status: ${niftiResponse.status}`);
      }
      const niftiFiles = await niftiResponse.json();

      if (niftiFiles.length > 0) {
          const volumes = [];
          const niftiBlob = await (await fetch(`/nifti/${patient}/${session}/${niftiFiles[0]}`, { headers })).blob();
          const niftiArrayBuffer = await niftiBlob.arrayBuffer();
          volumes.push({ 
              url: URL.createObjectURL(niftiBlob), 
              name: niftiFiles[0], 
              colormap: "gray", 
              opacity: 1,
              data: niftiArrayBuffer
          });

          if (qcType === 'LST_AI') {
              const segmentationResponse = await fetch(`/segmentation-files/${patient}/${session}`, { headers });
              if (!segmentationResponse.ok) {
                  throw new Error(`HTTP error! status: ${segmentationResponse.status}`);
              }
              const segmentationFiles = await segmentationResponse.json();
              if (segmentationFiles.length > 0) {
                  const segmentationBlob = await (await fetch(`/segmentation/${patient}/${session}/${segmentationFiles[0]}`, { headers })).blob();
                  const segmentationArrayBuffer = await segmentationBlob.arrayBuffer();
                  volumes.push({ 
                      url: URL.createObjectURL(segmentationBlob), 
                      name: segmentationFiles[0], 
                      colormap: "red", 
                      opacity: 1.0,
                      data: segmentationArrayBuffer
                  });
              }
          }

          self.postMessage({ volumes, index }, volumes.map(v => v.data));
      } else {
          throw new Error("No NIFTI files found");
      }
  } catch (error) {
      self.postMessage({ error: error.message, index });
  }
};
