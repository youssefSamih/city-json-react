import React, { Component } from "react";
import ReactDOM from "react-dom";
import * as THREE from "three";
import axios from "axios";

import { EventEmitter } from "./events";
import * as Functions from "./functions";

import CircularProgress from "@material-ui/core/CircularProgress";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

class ThreeScene extends Component {
  constructor(props) {
    super();

    this.handleWindowResize = this.debounce(
      this.handleWindowResize.bind(this),
      100
    );

    this.element = React.createRef();

    EventEmitter.subscribe("uploadFile", (event) => this.handleFile(event));
    this.handleFile = this.handleFile.bind(this);

    EventEmitter.subscribe("reloadScene", (event) => this.reloadScene(event));
    this.reloadScene = this.reloadScene.bind(this);

    EventEmitter.subscribe("loadScene", (event) => this.loadScene(event));
    this.loadScene = this.loadScene.bind(this);

    EventEmitter.subscribe("deleteObject", (event) => this.deleteObject(event));
    this.deleteObject = this.deleteObject.bind(this);

    this.clearScene = this.clearScene.bind(this);

    this.handleClick = this.handleClick.bind(this);

    this.state = {
      containerWidth: 0,
      containerHeight: 0,
      boolJSONload: false,
      cityModel: false,
      reload: true,
      selectedItem: undefined,
      isMounted: false,
    };
  }

  componentDidMount() {
    window.addEventListener("resize", this.handleWindowResize);
    document
      .getElementById("ThreeScene")
      .addEventListener("click", this.handleClick);

    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    //ADD SCENE
    this.scene = new THREE.Scene();
    //ADD CAMERA
    this.camera = new THREE.PerspectiveCamera();

    //ADD RENDERER
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor("#000000");
    this.renderer.setSize(width, height);
    this.mount.appendChild(this.renderer.domElement);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // add raycaster and mouse (for clickable objects)
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.highlighted = null;

    //add AmbientLight (light that is only there that there's a minimum of light and you can see color)
    //kind of the natural daylight
    this.am_light = new THREE.AmbientLight(0x666666, 0.7); // soft white light
    this.scene.add(this.am_light);

    // Add directional light
    this.spot_light = new THREE.SpotLight(0xdddddd);
    this.spot_light.position.set(84616, -1, 447422); // Can be problematic because scene is not normalised
    this.spot_light.target = this.scene;
    this.spot_light.castShadow = true;
    this.spot_light.intensity = 0.4;
    //this.spot_light.position.normalize();
    this.scene.add(this.spot_light);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    this.start();

    this.setState({
      isMounted: true,
      boolJSONload: false,
    });
  }

  componentWillUnmount() {
    this.setState({
      isMounted: false,
    });

    window.removeEventListener("resize", this.handleWindowResize);
    this.stop();
    this.mount.removeChild(this.renderer.domElement);
  }

  start = () => {
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.animate);

      this.controls.update();
    }
  };

  stop = () => {
    cancelAnimationFrame(this.frameId);
  };

  animate = () => {
    this.renderScene();
    this.frameId = window.requestAnimationFrame(this.animate);

    this.controls.update();
  };

  renderScene = () => {
    this.renderer.render(this.scene, this.camera);
  };

  reloadScene = async (evt) => {
    this.setState({
      reload: !this.state.reload,
    });
  };

  handleWindowResize() {
    if (this.state.isMounted) {
      this.setState({
        containerWidth: ReactDOM.findDOMNode(this.mount).offsetWidth,
      });

      this.setState({
        containerHeight: ReactDOM.findDOMNode(this.mount).offsetHeight,
      });

      this.camera.aspect =
        this.state.containerWidth / this.state.containerHeight;
      this.camera.updateProjectionMatrix();

      this.controls.update();

      this.renderer.setSize(
        this.state.containerWidth,
        this.state.containerHeight
      );
    }
  }

  debounce = (func, delay) => {
    let debounceTimer;
    return function () {
      const context = this;
      const args = arguments;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(context, args), delay);
    };
  };

  handleFile = (file) => {
    this.setState({
      boolJSONload: true,
    });

    axios
      .post("http://localhost:3001/measur3d/uploadCityModel", {
        json: file.content,
        cm_uid: file.cm_uid,
      })
      .then((res) => {
        EventEmitter.dispatch("success", res.data.success);
        EventEmitter.dispatch("info", "Now loading it into the scene.");

        this.setState({
          boolJSONload: false,
          cityModel: true,
        });

        //load the cityObjects into the viewer
        this.loadScene(file.cm_uid);
      })
      .catch(() => {
        this.setState({
          ...this.state,
          boolJSONload: false,
          cityModel: true,
        });

        this.loadScene(file.cm_uid);
      });
  };

  loadScene = (cm_uid) => {
    this.clearScene();

    this.setState({
      boolJSONload: true,
    });

    Functions.loadCityModel(this, cm_uid);

    EventEmitter.dispatch("cityModelLoaded", cm_uid);
  };

  clearScene = () => {
    // Be careful to not delete the light ... Speaking from experience
    var mesh = new THREE.Mesh();
    var points = new THREE.Points();

    this.scene.children = this.scene.children.filter(
      (value) => value.type !== mesh.type && value.type !== points.type
    );
  };

  handleClick = (evt) => {
    var action_button = document.querySelectorAll("div > div > span > button");

    // eslint-disable-next-line
    if (evt != undefined) {
      // eslint-disable-next-line
      if (evt.button != 0) return; // Only works if left mouse button is used
    }

    // eslint-disable-next-line
    if (evt == undefined) return;

    if (!this.state.cityModel) return;

    action_button.forEach(function (button) {
      button.style.visibility = "visible";
    });
    Functions.intersectMeshes(evt, this);
  };

  deleteObject = (uid) => {
    // Cleaning both Scene and ThreeScene objects -> Collisions seem to work oddly after it.
    this.setState({
      boolJSONload: true,
    });

    // Get mesh to be deleted
    var object = this.scene.children.filter((obj) => {
      return obj.uid === uid;
    });

    // Filter scene deleting objet and its children
    this.scene.children = this.scene.children.filter(
      (obj) => !object[0].childrenMeshes.concat(uid).includes(obj.uid)
    );

    this.renderer.render(this.scene, this.camera); // Cleaning for collisions.

    this.setState({
      boolJSONload: false,
    });
  };

  render() {
    return (
      <React.Fragment>
        <div
          ref={(mount) => {
            if (mount !== null) {
              this.mount = mount;
              if (!this.state.isMounted) {
                this.setState({
                  isMounted: true,
                });
                this.handleWindowResize();
                this.handleClick();
              }
            }
          }}
        />
        {this.state.boolJSONload ? <CircularProgress size={"4rem"} /> : null}
      </React.Fragment>
    );
  }
}

export default ThreeScene;
