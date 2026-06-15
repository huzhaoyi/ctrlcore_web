#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from glob import glob

from setuptools import find_packages, setup

package_name = "sealien_ctrlcore_web"


def _web_data_files():
    files = []
    web_root = "web"
    for path in glob(os.path.join(web_root, "**/*"), recursive=True):
        if os.path.isfile(path):
            rel_dir = os.path.dirname(path)
            install_dir = os.path.join("share", package_name, rel_dir)
            files.append((install_dir, [path]))
    return files


setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
        ("share/" + package_name + "/config", ["config/web_modules.yaml"]),
        ("share/" + package_name + "/launch", ["launch/ctrlcore_web.launch.py"]),
        ("share/" + package_name + "/scripts", glob("scripts/*.sh")),
    ]
    + _web_data_files(),
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="joey",
    maintainer_email="joey@sealien.cn",
    description="模块化 MCU 调试 Web 面板",
    license="Apache-2.0",
    entry_points={
        "console_scripts": [
            "ctrlcore_web_node = sealien_ctrlcore_web.web_node:main",
        ],
    },
)
